import { eq } from "drizzle-orm";

import type { Site } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { getGitProvider } from "@/lib/git/github";
import { assertWithin, buildItemPath } from "@/lib/git/paths";
import {
  type Actor,
  can,
  type Operation,
} from "@/lib/permissions";
import {
  effectiveSchemaOperations,
  findContentType,
  parsePortalSchema,
} from "@/lib/schema/parse";
import type { ContentType, PortalSchema } from "@/lib/schema/types";
import { commitFileDelete, commitFileWrite, type PipelineSite } from "@/lib/pipeline/commit";
import { buildCommitMessage, type WriteAction } from "@/lib/pipeline/messages";
import {
  type ContentValues,
  parseContentFile,
  serializeContentFile,
} from "./serialize";
import { validateValues } from "./validate";

/**
 * Content orchestration: the seam where schema + Git + permissions + the write
 * pipeline meet. API routes stay thin by delegating here. Every mutating call
 * re-checks permissions against the resolved Actor; nothing trusts the client.
 */

export class PermissionDeniedError extends Error {
  constructor(message = "You don't have permission to do that") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export class ValidationError extends Error {
  constructor(public readonly errors: { path: string; message: string }[]) {
    super("Content failed validation");
    this.name = "ValidationError";
  }
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

/** Read + validate portal.yml fresh from the repo, refreshing the cache. */
export async function loadSchema(site: Site): Promise<PortalSchema> {
  const git = getGitProvider();
  const file = await git.getFile(
    site.githubInstallationId,
    { owner: site.repoOwner, name: site.repoName },
    site.schemaPath,
    site.contentBranch,
  );
  if (!file) {
    throw new Error(`Schema file ${site.schemaPath} not found in repo`);
  }
  const parsed = parsePortalSchema(file.text);
  if (!parsed.ok) {
    throw new Error(`Invalid ${site.schemaPath}:\n${parsed.errors.join("\n")}`);
  }
  // Best-effort cache refresh; the repo remains the source of truth.
  await db
    .update(sites)
    .set({
      schemaJson: parsed.schema,
      schemaSha: file.sha,
      schemaSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sites.id, site.id));
  return parsed.schema;
}

/** The set of declared content directories/files — the path-safety allowlist. */
function allowedContentBases(schema: PortalSchema): string[] {
  return schema.content.map((c) => c.path);
}

export type SingletonRead = {
  type: ContentType;
  values: ContentValues;
  sha: string;
};

export async function readSingleton(
  site: Site,
  schema: PortalSchema,
  typeName: string,
): Promise<SingletonRead> {
  const ct = mustFindType(schema, typeName, "singleton");
  const git = getGitProvider();
  const file = await git.getFile(
    site.githubInstallationId,
    { owner: site.repoOwner, name: site.repoName },
    assertWithin(allowedContentBases(schema), ct.path),
    site.contentBranch,
  );
  return {
    type: ct,
    values: file ? parseContentFile(ct.format, file.text, ct.fields) : {},
    sha: file?.sha ?? "",
  };
}

export type CollectionEntry = {
  path: string;
  title: string;
  sha: string;
};

export async function listCollection(
  site: Site,
  schema: PortalSchema,
  typeName: string,
): Promise<{ type: ContentType; entries: CollectionEntry[] }> {
  const ct = mustFindType(schema, typeName, "collection");
  const git = getGitProvider();
  const dir = assertWithin(allowedContentBases(schema), ct.path);
  const listing = await git.listDir(
    site.githubInstallationId,
    { owner: site.repoOwner, name: site.repoName },
    dir,
    site.contentBranch,
  );

  const titleField = ct.type === "collection" ? ct.titleField : undefined;
  const entries: CollectionEntry[] = [];
  for (const entry of listing) {
    if (entry.type !== "file") continue;
    let title = entry.name;
    if (titleField) {
      const file = await git.getFile(
        site.githubInstallationId,
        { owner: site.repoOwner, name: site.repoName },
        entry.path,
        site.contentBranch,
      );
      if (file) {
        const values = parseContentFile(ct.format, file.text, ct.fields);
        if (typeof values[titleField] === "string") {
          title = values[titleField] as string;
        }
      }
    }
    entries.push({ path: entry.path, title, sha: entry.sha });
  }
  return { type: ct, entries };
}

export async function readCollectionItem(
  site: Site,
  schema: PortalSchema,
  typeName: string,
  itemPath: string,
): Promise<{ type: ContentType; values: ContentValues; sha: string }> {
  const ct = mustFindType(schema, typeName, "collection");
  const safePath = assertWithin([ct.path], itemPath);
  const git = getGitProvider();
  const file = await git.getFile(
    site.githubInstallationId,
    { owner: site.repoOwner, name: site.repoName },
    safePath,
    site.contentBranch,
  );
  if (!file) throw new Error(`Item not found: ${itemPath}`);
  return {
    type: ct,
    values: parseContentFile(ct.format, file.text, ct.fields),
    sha: file.sha,
  };
}

type SaveParams = {
  site: Site;
  actor: Actor;
  actorIdentity: { id: string | null; email: string; name?: string | null };
  schema: PortalSchema;
  typeName: string;
  values: ContentValues;
  /** Existing item path (update) or undefined for a new collection item. */
  path?: string;
  /** Slug for a new collection item. */
  slug?: string;
  baseSha?: string;
};

export async function saveContent(params: SaveParams) {
  const ct = findContentType(params.schema, params.typeName);
  if (!ct) throw new Error(`Unknown content type: ${params.typeName}`);

  const isCreate = ct.type === "collection" && !params.path;
  const op: Operation = isCreate ? "create" : "edit";
  requirePermission(params.actor, ct, op);

  const errors = validateValues(ct.fields, params.values);
  if (errors.length) throw new ValidationError(errors);

  // Resolve the target file path safely.
  let targetPath: string;
  if (ct.type === "singleton") {
    targetPath = assertWithin(allowedContentBases(params.schema), ct.path);
  } else if (params.path) {
    targetPath = assertWithin([ct.path], params.path);
  } else {
    const slug =
      params.slug ??
      (typeof params.values.slug === "string" ? params.values.slug : "");
    targetPath = buildItemPath(ct.path, ct.filename, slug, ct.format);
  }

  const content = serializeContentFile(ct.format, params.values, ct.fields);
  const action: WriteAction = isCreate ? "create" : "update";
  const message = buildCommitMessage({
    action,
    contentLabel: ct.label,
    actorEmail: params.actorIdentity.email,
  });

  return commitFileWrite({
    site: pipelineSite(params.site),
    actor: params.actorIdentity,
    filePath: targetPath,
    content,
    baseSha: isCreate ? undefined : params.baseSha,
    message,
    auditAction: `content.${action}`,
    summary: `${action} ${ct.label}`,
    metadata: { contentType: ct.name },
  });
}

type DeleteParams = {
  site: Site;
  actor: Actor;
  actorIdentity: { id: string | null; email: string; name?: string | null };
  schema: PortalSchema;
  typeName: string;
  path: string;
  baseSha: string;
};

export async function deleteContent(params: DeleteParams) {
  const ct = mustFindType(params.schema, params.typeName, "collection");
  requirePermission(params.actor, ct, "delete");
  const targetPath = assertWithin([ct.path], params.path);
  const message = buildCommitMessage({
    action: "delete",
    contentLabel: ct.label,
    actorEmail: params.actorIdentity.email,
  });
  return commitFileDelete({
    site: pipelineSite(params.site),
    actor: params.actorIdentity,
    filePath: targetPath,
    baseSha: params.baseSha,
    message,
    auditAction: "content.delete",
    summary: `delete ${ct.label}`,
  });
}

// --- helpers ---

function mustFindType(
  schema: PortalSchema,
  typeName: string,
  kind: ContentType["type"],
): ContentType {
  const ct = findContentType(schema, typeName);
  if (!ct) throw new Error(`Unknown content type: ${typeName}`);
  if (ct.type !== kind) {
    throw new Error(`Content type "${typeName}" is not a ${kind}`);
  }
  return ct;
}

function requirePermission(actor: Actor, ct: ContentType, op: Operation): void {
  const allowed = can(op, {
    actor,
    contentTypeKey: ct.name,
    schemaOperations: effectiveSchemaOperations(ct),
  });
  if (!allowed) throw new PermissionDeniedError();
}
