import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Drizzle database client backed by postgres.js.
 *
 * On serverless (Vercel) each invocation may create a fresh connection, so we
 * keep the pool small and disable prepared statements (incompatible with
 * Supabase's transaction-mode pooler). For local dev / long-lived processes we
 * memoise the client on globalThis to avoid exhausting connections during HMR.
 */
const globalForDb = globalThis as unknown as {
  __portalSql?: ReturnType<typeof postgres>;
};

function createClient() {
  const env = getEnv();
  const sql =
    globalForDb.__portalSql ??
    postgres(env.DATABASE_URL, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
    });
  if (env.NODE_ENV !== "production") globalForDb.__portalSql = sql;
  return drizzle(sql, { schema });
}

export const db = createClient();
export { schema };
export type Database = typeof db;
