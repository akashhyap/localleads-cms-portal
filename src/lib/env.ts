import { z } from "zod";

/**
 * Server-side environment configuration.
 *
 * Every secret lives here and is validated at boot so a misconfigured
 * deployment fails loudly instead of at the first GitHub call. NOTHING in this
 * file may be imported from client components — see `env.client.ts` for the
 * (tiny) set of values that are safe to ship to the browser.
 */
const serverSchema = z.object({
  // --- Database (Supabase Postgres, accessed via Drizzle/postgres.js) ---
  DATABASE_URL: z.string().url(),

  // --- Supabase Auth ---
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // --- GitHub App (all server-side; the private key never reaches a browser) ---
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_CLIENT_ID: z.string().min(1),
  GITHUB_APP_CLIENT_SECRET: z.string().min(1).optional(),
  // PEM contents. Supports either a raw PEM or a base64-encoded PEM (handy for
  // single-line env vars on Vercel). `\n` escapes are normalised.
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_APP_WEBHOOK_SECRET: z.string().min(1).optional(),

  // --- App ---
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // --- Inngest (background pipeline: write retries + deploy status polling) ---
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function normalizePrivateKey(raw: string): string {
  // Allow base64-encoded PEMs (no "BEGIN" marker => assume base64).
  const value = raw.includes("BEGIN")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  // Restore real newlines if the env var stored escaped ones.
  return value.replace(/\\n/g, "\n");
}

let cached: ServerEnv | null = null;

/**
 * Returns the validated server environment. Lazily parsed and cached so that
 * importing modules at build time doesn't crash when env vars are absent.
 */
export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  cached = {
    ...parsed.data,
    GITHUB_APP_PRIVATE_KEY: normalizePrivateKey(parsed.data.GITHUB_APP_PRIVATE_KEY),
  };
  return cached;
}
