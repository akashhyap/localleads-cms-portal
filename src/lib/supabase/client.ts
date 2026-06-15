"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (anon key only — safe for the client). */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
