import { desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { ApiError, json, requireSiteAccess, route } from "@/lib/api/context";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

type Ctx = { params: Promise<{ siteId: string }> };

/** Per-site audit log (agency only). */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { siteId } = await ctx.params;
  const { access } = await requireSiteAccess(siteId);
  if (access.actor.kind !== "agency") throw new ApiError(403, "Staff access required");

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 200);
  const rows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.siteId, siteId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return json({ entries: rows });
});
