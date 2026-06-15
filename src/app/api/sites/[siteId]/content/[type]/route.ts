import type { NextRequest } from "next/server";
import { z } from "zod";

import { error, json, requireSiteAccess, route } from "@/lib/api/context";
import { rateLimit } from "@/lib/api/rate-limit";
import {
  listCollection,
  loadSchema,
  readSingleton,
  saveContent,
} from "@/lib/content/service";
import { resolveContentPermissions } from "@/lib/permissions";
import { effectiveSchemaOperations, findContentType } from "@/lib/schema/parse";

type Ctx = { params: Promise<{ siteId: string; type: string }> };

/** Read a singleton's values, or list a collection's items. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const { siteId, type } = await ctx.params;
  const { access } = await requireSiteAccess(siteId);
  const schema = await loadSchema(access.site);
  const ct = findContentType(schema, type);
  if (!ct) return error(404, "Unknown content type");

  const permissions = resolveContentPermissions({
    actor: access.actor,
    contentTypeKey: ct.name,
    schemaOperations: effectiveSchemaOperations(ct),
  });

  if (ct.type === "singleton") {
    const data = await readSingleton(access.site, schema, type);
    return json({ kind: "singleton", type: ct, permissions, values: data.values, sha: data.sha });
  }
  const list = await listCollection(access.site, schema, type);
  return json({ kind: "collection", type: ct, permissions, entries: list.entries });
});

const saveSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  baseSha: z.string().optional(),
});

/** Save a singleton (full update of the one file). */
export const PUT = route(async (req: NextRequest, ctx: Ctx) => {
  const { siteId, type } = await ctx.params;
  const { user, access } = await requireSiteAccess(siteId);
  rateLimit(`save:${user.id}`);

  const body = saveSchema.safeParse(await req.json());
  if (!body.success) return error(400, "Invalid body");

  const schema = await loadSchema(access.site);
  const outcome = await saveContent({
    site: access.site,
    actor: access.actor,
    actorIdentity: { id: user.id, email: user.email },
    schema,
    typeName: type,
    values: body.data.values,
    baseSha: body.data.baseSha,
  });
  if (!outcome.ok) {
    return json({ error: "conflict", message: "This file changed in GitHub. Reload and try again." }, { status: 409 });
  }
  return json({ ok: true, commitSha: outcome.commitSha, sha: outcome.blobSha });
});

const createSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  slug: z.string().optional(),
});

/** Create a new collection item. */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const { siteId, type } = await ctx.params;
  const { user, access } = await requireSiteAccess(siteId);
  rateLimit(`create:${user.id}`);

  const body = createSchema.safeParse(await req.json());
  if (!body.success) return error(400, "Invalid body");

  const schema = await loadSchema(access.site);
  const outcome = await saveContent({
    site: access.site,
    actor: access.actor,
    actorIdentity: { id: user.id, email: user.email },
    schema,
    typeName: type,
    values: body.data.values,
    slug: body.data.slug,
  });
  if (!outcome.ok) {
    return json({ error: "conflict" }, { status: 409 });
  }
  return json({ ok: true, commitSha: outcome.commitSha }, { status: 201 });
});
