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

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

function createClient(): DrizzleClient {
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

/**
 * Lazily-initialised Drizzle client. The connection (and env validation) is
 * deferred until the first query, so importing modules that merely reference
 * `db` doesn't require a configured environment (keeps unit tests import-safe).
 */
let instance: DrizzleClient | null = null;
export const db = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    instance ??= createClient();
    return Reflect.get(instance, prop, receiver);
  },
}) as DrizzleClient;

export { schema };
export type Database = DrizzleClient;
