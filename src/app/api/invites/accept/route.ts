import type { NextRequest } from "next/server";
import { z } from "zod";

import { error, json, requireUser, route } from "@/lib/api/context";
import { acceptInvite } from "@/lib/invites/service";

const schema = z.object({ token: z.string().min(1) });

/** Redeem an invite for the authenticated user. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  const body = schema.safeParse(await req.json());
  if (!body.success) return error(400, "Invalid body");

  const result = await acceptInvite(body.data.token, user);
  if (!result.ok) {
    const status = result.reason === "email-mismatch" ? 403 : 410;
    return json({ error: result.reason }, { status });
  }
  return json({ ok: true, siteId: result.siteId });
});
