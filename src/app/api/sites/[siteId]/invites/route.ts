import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, error, json, requireSiteAccess, route } from "@/lib/api/context";
import { rateLimit } from "@/lib/api/rate-limit";
import { createInvite, listInvites } from "@/lib/invites/service";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ siteId: string }> };

function requireAgency(access: { actor: { kind: string } }) {
  if (access.actor.kind !== "agency") throw new ApiError(403, "Staff access required");
}

/** List invites for a site (agency only). */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const { siteId } = await ctx.params;
  const { access } = await requireSiteAccess(siteId);
  requireAgency(access);
  return json({ invites: await listInvites(siteId) });
});

const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(["client_editor", "viewer"]).optional(),
  permissions: z.record(z.string(), z.unknown()).optional(),
});

/** Invite a client by email + send a magic link (agency only). */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const { siteId } = await ctx.params;
  const { user, access } = await requireSiteAccess(siteId);
  requireAgency(access);
  rateLimit(`invite:${user.id}`, { limit: 20, windowMs: 60_000 });

  const body = createSchema.safeParse(await req.json());
  if (!body.success) return error(400, "Invalid body");

  const invite = await createInvite({
    siteId,
    email: body.data.email,
    role: body.data.role,
    permissions: body.data.permissions,
    invitedBy: { id: user.id, email: user.email },
  });

  // Best-effort magic-link email. Requires SMTP configured in Supabase; the
  // returned acceptUrl can always be shared manually as a fallback.
  let emailSent = false;
  try {
    const { error: linkErr } = await getSupabaseAdmin().auth.admin.generateLink({
      type: "magiclink",
      email: invite.email,
      options: { redirectTo: invite.acceptUrl },
    });
    emailSent = !linkErr;
  } catch {
    emailSent = false;
  }

  return json({ ok: true, inviteId: invite.id, acceptUrl: invite.acceptUrl, emailSent }, { status: 201 });
});
