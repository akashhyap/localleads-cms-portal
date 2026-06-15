import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getEnv } from "@/lib/env";

/**
 * Supabase client bound to the request's auth cookies (App Router, RSC + route
 * handlers). Used only to read the authenticated identity — all authorization
 * is enforced in our own policy layer (src/lib/auth/access.ts), with Supabase
 * RLS as a defence-in-depth backstop.
 */
export async function createSupabaseServerClient() {
  const env = getEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll called from a Server Component — safe to ignore; the
            // session refresh is handled by middleware.
          }
        },
      },
    },
  );
}
