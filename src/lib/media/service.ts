import type { Site } from "@/lib/auth/access";
import { getGitProvider } from "@/lib/git/github";
import { assertWithin, normalizeRepoPath } from "@/lib/git/paths";
import { canUseMedia, type Actor } from "@/lib/permissions";
import { commitFileWrite, type PipelineSite } from "@/lib/pipeline/commit";
import { buildMediaCommitMessage } from "@/lib/pipeline/messages";
import type { MediaConfig, PortalSchema } from "@/lib/schema/types";
import { PermissionDeniedError } from "@/lib/content/service";

/** Image upload + browse, committed to the schema's media directory. */

export class MediaError extends Error {}

function media(schema: PortalSchema): MediaConfig {
  if (!schema.media) throw new MediaError("This site has no media configuration");
  return schema.media;
}

function sanitizeFilename(name: string): string {
  const base = name.split("/").pop() ?? name;
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned || cleaned === ".") throw new MediaError("Invalid filename");
  return cleaned;
}

function pipelineSite(site: Site): PipelineSite {
  return {
    id: site.id,
    installationId: site.githubInstallationId,
    repoOwner: site.repoOwner,
    repoName: site.repoName,
    branch: site.contentBranch,
  };
}

export async function listMedia(site: Site, schema: PortalSchema) {
  const cfg = media(schema);
  const git = getGitProvider();
  const entries = await git.listDir(
    site.githubInstallationId,
    { owner: site.repoOwner, name: site.repoName },
    normalizeRepoPath(cfg.input),
    site.contentBranch,
  );
  return entries
    .filter((e) => e.type === "file")
    .map((e) => ({
      name: e.name,
      path: e.path,
      sha: e.sha,
      size: e.size,
      url: `${cfg.output.replace(/\/$/, "")}/${e.name}`,
    }));
}

export type UploadInput = {
  site: Site;
  actor: Actor;
  actorIdentity: { id: string | null; email: string; name?: string | null };
  schema: PortalSchema;
  filename: string;
  bytes: Uint8Array;
  /** SHA of an existing file when replacing. */
  baseSha?: string;
};

export async function uploadMedia(input: UploadInput) {
  if (!canUseMedia(input.actor)) throw new PermissionDeniedError("Media uploads are not permitted");
  const cfg = media(input.schema);

  const filename = sanitizeFilename(input.filename);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!cfg.extensions.map((e) => e.toLowerCase()).includes(ext)) {
    throw new MediaError(`File type .${ext} is not allowed (allowed: ${cfg.extensions.join(", ")})`);
  }
  if (input.bytes.byteLength > cfg.maxSize) {
    throw new MediaError(
      `File is too large (${Math.round(input.bytes.byteLength / 1024)}KB; max ${Math.round(cfg.maxSize / 1024)}KB)`,
    );
  }

  const targetPath = assertWithin([cfg.input], `${normalizeRepoPath(cfg.input)}/${filename}`);
  const message = buildMediaCommitMessage({
    action: input.baseSha ? "replace" : "upload",
    filename,
    actorEmail: input.actorIdentity.email,
  });

  const outcome = await commitFileWrite({
    site: pipelineSite(input.site),
    actor: input.actorIdentity,
    filePath: targetPath,
    content: input.bytes,
    baseSha: input.baseSha,
    message,
    auditAction: input.baseSha ? "media.replace" : "media.upload",
    summary: `${input.baseSha ? "Replaced" : "Uploaded"} ${filename}`,
    metadata: { bytes: input.bytes.byteLength },
  });

  if (!outcome.ok) return { ok: false as const, conflict: true as const };
  return {
    ok: true as const,
    path: targetPath,
    url: `${cfg.output.replace(/\/$/, "")}/${filename}`,
    commitSha: outcome.commitSha,
    sha: outcome.blobSha,
  };
}
