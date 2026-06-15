import type { NextRequest } from "next/server";
import { z } from "zod";

import { error, json, requireSiteAccess, route } from "@/lib/api/context";
import { rateLimit } from "@/lib/api/rate-limit";
import {
  deleteContent,
  loadSchema,
  readCollectionItem,
  saveContent,
} from "@/lib/content/service";

type Ctx = { params: Promise<{ siteId: string; type: string }> };

/** Read a single collection item by ?path=. */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { siteId, type } = await ctx.params;
  const { access } = await requireSiteAccess(siteId);
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return error(400, "path is required");

  const schema = await loadSchema(access.site);
  const item = await readCollectionItem(access.site, schema, type, path);
  return json({ type: item.type, values: item.values, sha: item.sha, path });
});

const saveSchema = z.object({
  path: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
  baseSha: z.string().min(1),
});

/** Update an existing collection item. */
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
    path: body.data.path,
    baseSha: body.data.baseSha,
  });
  if (!outcome.ok) return json({ error: "conflict" }, { status: 409 });
  return json({ ok: true, commitSha: outcome.commitSha, sha: outcome.blobSha });
});

const deleteSchema = z.object({ path: z.string().min(1), baseSha: z.string().min(1) });

/** Delete a collection item (permission-gated; clients usually can't). */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  const { siteId, type } = await ctx.params;
  const { user, access } = await requireSiteAccess(siteId);
  rateLimit(`delete:${user.id}`);

  const body = deleteSchema.safeParse(await req.json());
  if (!body.success) return error(400, "Invalid body");

  const schema = await loadSchema(access.site);
  const outcome = await deleteContent({
    site: access.site,
    actor: access.actor,
    actorIdentity: { id: user.id, email: user.email },
    schema,
    typeName: type,
    path: body.data.path,
    baseSha: body.data.baseSha,
  });
  if (!outcome.ok) return json({ error: "conflict" }, { status: 409 });
  return json({ ok: true, commitSha: outcome.commitSha });
});
