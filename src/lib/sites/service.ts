import { eq } from "drizzle-orm";

import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { organizations, sites } from "@/lib/db/schema";
import { getGitProvider } from "@/lib/git/github";
import { parsePortalSchema } from "@/lib/schema/parse";

/**
 * Site registration + repo discovery for the Add Site flow.
 */

export async function listInstallationRepos(installationId: number) {
  return getGitProvider().listRepos(installationId);
}

export type RegisterSiteInput = {
  orgId: string;
  name: string;
  installationId: number;
  repoOwner: string;
  repoName: string;
  contentBranch?: string;
  schemaPath?: string;
  actor: { id: string; email: string };
};

export type RegisterResult =
  | { ok: true; siteId: string }
  | { ok: false; errors: string[] };

/**
 * Validate the repo's portal.yml and register the site. Refuses to register a
 * repo whose schema is missing or invalid, reporting every error.
 */
export async function registerSite(
  input: RegisterSiteInput,
): Promise<RegisterResult> {
  const branch = input.contentBranch || "main";
  const schemaPath = input.schemaPath || "portal.yml";
  const git = getGitProvider();

  const file = await git.getFile(
    input.installationId,
    { owner: input.repoOwner, name: input.repoName },
    schemaPath,
    branch,
  );
  if (!file) {
    return { ok: false, errors: [`No ${schemaPath} found on branch ${branch}`] };
  }
  const parsed = parsePortalSchema(file.text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const [site] = await db
    .insert(sites)
    .values({
      orgId: input.orgId,
      name: input.name,
      githubInstallationId: input.installationId,
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      contentBranch: branch,
      schemaPath,
      schemaJson: parsed.schema,
      schemaSha: file.sha,
      schemaSyncedAt: new Date(),
    })
    .returning({ id: sites.id });

  await recordAudit({
    siteId: site.id,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: "site.register",
    summary: `Registered ${input.repoOwner}/${input.repoName}`,
    metadata: { branch, schemaPath },
  });

  return { ok: true, siteId: site.id };
}

/** The single agency org (multi-tenant-ready, single-tenant in practice). */
export async function getDefaultOrg() {
  const rows = await db.select().from(organizations).limit(1);
  return rows[0] ?? null;
}

export async function getSiteById(siteId: string) {
  const rows = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  return rows[0] ?? null;
}
