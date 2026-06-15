import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthUser = {
  id: string;
  email: string;
};

/**
 * Returns the authenticated user from the Supabase session, or null. Ensures a
 * matching `profiles` row exists (created lazily on first authenticated
 * request, since users arrive via magic link / invite without a sign-up form).
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;

  await ensureProfile({ id: user.id, email: user.email });
  return { id: user.id, email: user.email };
}

export async function ensureProfile(user: AuthUser): Promise<void> {
  await db
    .insert(profiles)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { email: user.email },
    });
}
