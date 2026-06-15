import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

/**
 * Append a row to the audit log. The table is append-only (DB rules block
 * UPDATE/DELETE), so this is the only way history is ever written.
 *
 * Accepts an optional transaction so a write and its audit entry land
 * atomically.
 */
export type AuditEntry = {
  siteId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  filePath?: string | null;
  commitSha?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
};

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function recordAudit(entry: AuditEntry, tx: Db = db): Promise<void> {
  await tx.insert(auditLog).values({
    siteId: entry.siteId,
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    filePath: entry.filePath ?? null,
    commitSha: entry.commitSha ?? null,
    summary: entry.summary ?? null,
    metadata: entry.metadata ?? {},
  });
}
