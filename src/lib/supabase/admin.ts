import { createClient } from "@supabase/supabase-js";

import { getEnv } from "@/lib/env";

/**
 * Service-role Supabase client for privileged auth operations (sending magic
 * links to invited clients). Server-side only — the service role key must never
 * reach a browser.
 */
let cached: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (cached) return cached;
  const env = getEnv();
  cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
