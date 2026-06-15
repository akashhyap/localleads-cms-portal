import { eq, sql } from "drizzle-orm";

import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { commitJobs } from "@/lib/db/schema";
import { getGitProvider } from "@/lib/git/github";
import { ConflictError } from "@/lib/git/types";

/**
 * The write pipeline.
 *
 * Design notes (deliberately "better than Pages CMS"):
 *  - Every write is recorded as a durable `commit_jobs` row for auditing and
 *    observability, then attempted inline so the editor gets instant feedback.
 *  - Writes to the same (site, filePath) are serialised with a Postgres
 *    advisory lock so two concurrent saves can't lose an update.
 *  - Optimistic concurrency: the editor's base SHA is passed to the provider;
 *    a mismatch surfaces as a clean conflict ("reload"), never a silent clobber.
 *  - We do NOT persist the file bytes in our DB — content lives only in Git.
 *    A failed write is re-driven by the editor re-saving, not by replaying
 *    stored content.
 */

export type PipelineSite = {
  id: string;
  installationId: number;
  repoOwner: string;
  repoName: string;
  branch: string;
};

export type PipelineActor = {
  id: string | null;
  email: string;
  name?: string | null;
};

export type WriteOutcome =
  | { ok: true; commitSha: string; blobSha: string; jobId: string }
  | { ok: false; conflict: true; jobId: string };

type CommitWriteParams = {
  site: PipelineSite;
  actor: PipelineActor;
  filePath: string;
  content: Uint8Array | string;
  /** Blob SHA the editor loaded. Omit to create a new file. */
  baseSha?: string;
  message: string;
  /** Audit action, e.g. "content.update", "content.create", "media.upload". */
  auditAction: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

function advisoryKey(siteId: string, filePath: string): string {
  return `${siteId}:${filePath}`;
}

export async function commitFileWrite(
  params: CommitWriteParams,
): Promise<WriteOutcome> {
  const git = getGitProvider();
  const author = {
    name: params.actor.name?.trim() || params.actor.email,
    email: params.actor.email,
  };

  const [job] = await db
    .insert(commitJobs)
    .values({
      siteId: params.site.id,
      actorId: params.actor.id,
      actorEmail: params.actor.email,
      filePath: params.filePath,
      baseSha: params.baseSha ?? null,
      payload: { message: params.message, auditAction: params.auditAction },
      status: "processing",
      attempts: 1,
    })
    .returning({ id: commitJobs.id });

  try {
    const result = await db.transaction(async (tx) => {
      // Serialise concurrent writes to the same file across all workers.
      const key = advisoryKey(params.site.id, params.filePath);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${key})::bigint)`,
      );

      const write = await git.writeFile(
        params.site.installationId,
        { owner: params.site.repoOwner, name: params.site.repoName },
        {
          branch: params.site.branch,
          path: params.filePath,
          content: params.content,
          message: params.message,
          sha: params.baseSha,
          author,
        },
      );

      await tx
        .update(commitJobs)
        .set({
          status: "committed",
          resultCommitSha: write.commitSha,
          updatedAt: new Date(),
        })
        .where(eq(commitJobs.id, job.id));

      await recordAudit(
        {
          siteId: params.site.id,
          actorId: params.actor.id,
          actorEmail: params.actor.email,
          action: params.auditAction,
          filePath: params.filePath,
          commitSha: write.commitSha,
          summary: params.summary ?? null,
          metadata: params.metadata,
        },
        tx,
      );

      return write;
    });

    return {
      ok: true,
      commitSha: result.commitSha,
      blobSha: result.blobSha,
      jobId: job.id,
    };
  } catch (err) {
    if (err instanceof ConflictError) {
      await db
        .update(commitJobs)
        .set({ status: "conflict", lastError: err.message, updatedAt: new Date() })
        .where(eq(commitJobs.id, job.id));
      return { ok: false, conflict: true, jobId: job.id };
    }
    await db
      .update(commitJobs)
      .set({
        status: "failed",
        lastError: (err as Error).message,
        updatedAt: new Date(),
      })
      .where(eq(commitJobs.id, job.id));
    throw err;
  }
}

type DeleteParams = {
  site: PipelineSite;
  actor: PipelineActor;
  filePath: string;
  baseSha: string;
  message: string;
  auditAction: string;
  summary?: string;
};

export async function commitFileDelete(
  params: DeleteParams,
): Promise<WriteOutcome> {
  const git = getGitProvider();
  const author = {
    name: params.actor.name?.trim() || params.actor.email,
    email: params.actor.email,
  };

  const [job] = await db
    .insert(commitJobs)
    .values({
      siteId: params.site.id,
      actorId: params.actor.id,
      actorEmail: params.actor.email,
      filePath: params.filePath,
      baseSha: params.baseSha,
      payload: { message: params.message, auditAction: params.auditAction },
      status: "processing",
      attempts: 1,
    })
    .returning({ id: commitJobs.id });

  try {
    const result = await db.transaction(async (tx) => {
      const key = advisoryKey(params.site.id, params.filePath);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${key})::bigint)`,
      );

      const del = await git.deleteFile(
        params.site.installationId,
        { owner: params.site.repoOwner, name: params.site.repoName },
        {
          branch: params.site.branch,
          path: params.filePath,
          sha: params.baseSha,
          message: params.message,
          author,
        },
      );

      await tx
        .update(commitJobs)
        .set({
          status: "committed",
          resultCommitSha: del.commitSha,
          updatedAt: new Date(),
        })
        .where(eq(commitJobs.id, job.id));

      await recordAudit(
        {
          siteId: params.site.id,
          actorId: params.actor.id,
          actorEmail: params.actor.email,
          action: params.auditAction,
          filePath: params.filePath,
          commitSha: del.commitSha,
          summary: params.summary ?? null,
        },
        tx,
      );

      return del;
    });

    return { ok: true, commitSha: result.commitSha, blobSha: "", jobId: job.id };
  } catch (err) {
    if (err instanceof ConflictError) {
      await db
        .update(commitJobs)
        .set({ status: "conflict", lastError: err.message, updatedAt: new Date() })
        .where(eq(commitJobs.id, job.id));
      return { ok: false, conflict: true, jobId: job.id };
    }
    await db
      .update(commitJobs)
      .set({
        status: "failed",
        lastError: (err as Error).message,
        updatedAt: new Date(),
      })
      .where(eq(commitJobs.id, job.id));
    throw err;
  }
}
