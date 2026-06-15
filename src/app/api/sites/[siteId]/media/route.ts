import type { NextRequest } from "next/server";

import { error, json, requireSiteAccess, route } from "@/lib/api/context";
import { rateLimit } from "@/lib/api/rate-limit";
import { loadSchema } from "@/lib/content/service";
import { listMedia, MediaError, uploadMedia } from "@/lib/media/service";

type Ctx = { params: Promise<{ siteId: string }> };

/** Browse the site's media. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const { siteId } = await ctx.params;
  const { access } = await requireSiteAccess(siteId);
  const schema = await loadSchema(access.site);
  return json({ media: await listMedia(access.site, schema) });
});

/** Upload (or replace) an image. multipart/form-data: file, [baseSha]. */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const { siteId } = await ctx.params;
  const { user, access } = await requireSiteAccess(siteId);
  rateLimit(`media:${user.id}`, { limit: 20, windowMs: 60_000 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return error(400, "file is required");
  const baseSha = (form.get("baseSha") as string) || undefined;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const schema = await loadSchema(access.site);

  try {
    const result = await uploadMedia({
      site: access.site,
      actor: access.actor,
      actorIdentity: { id: user.id, email: user.email },
      schema,
      filename: file.name,
      bytes,
      baseSha,
    });
    if (!result.ok) return json({ error: "conflict" }, { status: 409 });
    return json({ ok: true, url: result.url, path: result.path, sha: result.sha }, { status: 201 });
  } catch (err) {
    if (err instanceof MediaError) return error(422, err.message);
    throw err;
  }
});
