import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, error, json, requireSiteAccess, route } from "@/lib/api/context";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";

type Ctx = { params: Promise<{ siteId: string }> };

const patchSchema = z.object({
  clientEditingEnabled: z.boolean().optional(),
  deployAdapter: z.enum(["cloudways", "cloudflare", "vercel", "none"]).optional(),
  deployConfig: z.record(z.string(), z.unknown()).optional(),
  name: z.string().min(1).optional(),
});

/** Update site settings incl. the client-editing toggle (agency only). */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const { siteId } = await ctx.params;
  const { user, access } = await requireSiteAccess(siteId);
  if (access.actor.kind !== "agency") throw new ApiError(403, "Staff access required");

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) return error(400, "Invalid body");

  await db
    .update(sites)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(sites.id, siteId));

  if (body.data.clientEditingEnabled !== undefined) {
    await recordAudit({
      siteId,
      actorId: user.id,
      actorEmail: user.email,
      action: "site.client_editing_toggle",
      summary: `Client editing turned ${body.data.clientEditingEnabled ? "ON" : "OFF"}`,
    });
  }

  return json({ ok: true });
});
