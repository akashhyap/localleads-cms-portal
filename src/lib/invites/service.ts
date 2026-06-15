import { createHash, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { invites, siteMembers } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import type { MemberPermissionOverride } from "@/lib/permissions";

/**
 * Per-site email invites with magic-link onboarding. Clients never need a
 * GitHub account or a password: they receive a link, authenticate via Supabase
 * magic link, and the matching invite is redeemed into a site membership.
 *
 * Only the SHA-256 of the token is stored — the raw token lives only in the
 * emailed link.
 */

const INVITE_TTL_DAYS = 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type CreateInviteInput = {
  siteId: string;
  email: string;
  role?: "client_editor" | "viewer";
  permissions?: MemberPermissionOverride;
  invitedBy: { id: string; email: string };
};

export async function createInvite(input: CreateInviteInput) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  const email = input.email.trim().toLowerCase();

  const [invite] = await db
    .insert(invites)
    .values({
      siteId: input.siteId,
      email,
      role: input.role ?? "client_editor",
      permissions: input.permissions ?? {},
      tokenHash: hashToken(token),
      status: "pending",
      invitedBy: input.invitedBy.id,
      expiresAt,
    })
    .returning({ id: invites.id });

  await recordAudit({
    siteId: input.siteId,
    actorId: input.invitedBy.id,
    actorEmail: input.invitedBy.email,
    action: "invite.create",
    summary: `Invited ${email}`,
    metadata: { role: input.role ?? "client_editor" },
  });

  const acceptUrl = `${getEnv().APP_URL}/invite/${token}`;
  return { id: invite.id, email, acceptUrl };
}

export type AcceptResult =
  | { ok: true; siteId: string }
  | { ok: false; reason: "not-found" | "expired" | "email-mismatch" | "used" };

/**
 * Redeem an invite for an authenticated user. The user's email must match the
 * invite. Creates the site membership and marks the invite accepted.
 */
export async function acceptInvite(
  token: string,
  user: { id: string; email: string },
): Promise<AcceptResult> {
  const rows = await db
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, hashToken(token)))
    .limit(1);
  const invite = rows[0];
  if (!invite) return { ok: false, reason: "not-found" };
  if (invite.status !== "pending") return { ok: false, reason: "used" };
  if (invite.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (invite.email !== user.email.trim().toLowerCase()) {
    return { ok: false, reason: "email-mismatch" };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(siteMembers)
      .values({
        siteId: invite.siteId,
        userId: user.id,
        role: invite.role,
        permissions: invite.permissions,
      })
      .onConflictDoUpdate({
        target: [siteMembers.siteId, siteMembers.userId],
        set: { role: invite.role, permissions: invite.permissions },
      });
    await tx
      .update(invites)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(invites.id, invite.id));
    await recordAudit(
      {
        siteId: invite.siteId,
        actorId: user.id,
        actorEmail: user.email,
        action: "invite.accept",
        summary: `${user.email} accepted invite`,
      },
      tx,
    );
  });

  return { ok: true, siteId: invite.siteId };
}

export async function listInvites(siteId: string) {
  return db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      status: invites.status,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(eq(invites.siteId, siteId));
}

export async function revokeInvite(siteId: string, inviteId: string) {
  await db
    .update(invites)
    .set({ status: "revoked" })
    .where(and(eq(invites.id, inviteId), eq(invites.siteId, siteId)));
}
