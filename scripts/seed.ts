/**
 * Seed script: creates the single agency organization and grants owner access
 * to the first user.
 *
 *   pnpm tsx scripts/seed.ts "Your Agency" you@agency.com
 *
 * The user must first sign in once (magic link) so their Supabase auth user and
 * profile row exist; this script then promotes them to org owner. If no profile
 * exists yet, it creates a placeholder profile keyed by the auth user id, which
 * you can supply via SEED_USER_ID, or it will look the user up by email in the
 * profiles table.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { orgMembers, organizations, profiles } from "../src/lib/db/schema";

async function main() {
  const [, , orgNameArg, emailArg] = process.argv;
  const orgName = orgNameArg ?? "My Agency";
  const email = (emailArg ?? process.env.SEED_OWNER_EMAIL ?? "").toLowerCase();
  if (!email) {
    throw new Error("Usage: pnpm tsx scripts/seed.ts \"Agency Name\" owner@email.com");
  }

  // 1) Organization (idempotent on slug).
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let org = (await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1))[0];
  if (!org) {
    [org] = await db.insert(organizations).values({ name: orgName, slug }).returning();
    console.log(`Created organization: ${org.name} (${org.id})`);
  } else {
    console.log(`Organization exists: ${org.name} (${org.id})`);
  }

  // 2) Find the owner profile. Created automatically on first login; if the
  // user hasn't logged in yet, set SEED_USER_ID to their Supabase auth uid.
  let profile = (await db.select().from(profiles).where(eq(profiles.email, email)).limit(1))[0];
  if (!profile && process.env.SEED_USER_ID) {
    [profile] = await db
      .insert(profiles)
      .values({ id: process.env.SEED_USER_ID, email, isStaff: true })
      .onConflictDoUpdate({ target: profiles.id, set: { isStaff: true } })
      .returning();
    console.log(`Created profile for ${email}`);
  }
  if (!profile) {
    throw new Error(
      `No profile for ${email}. Have them sign in once (magic link), or set SEED_USER_ID to their Supabase auth user id and re-run.`,
    );
  }

  // 3) Owner membership (idempotent).
  await db
    .insert(orgMembers)
    .values({ orgId: org.id, userId: profile.id, role: "owner" })
    .onConflictDoUpdate({
      target: [orgMembers.orgId, orgMembers.userId],
      set: { role: "owner" },
    });
  await db.update(profiles).set({ isStaff: true }).where(eq(profiles.id, profile.id));

  console.log(`✓ ${email} is now OWNER of ${org.name}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
