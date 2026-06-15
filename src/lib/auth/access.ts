import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { orgMembers, siteMembers, sites } from "@/lib/db/schema";
import type { Actor, MemberPermissionOverride } from "@/lib/permissions";

/**
 * The authorization policy layer.
 *
 * Every API route resolves access here, server-side, before any repo I/O.
 * Two rules dominate:
 *   1. Agency staff/owners (org_members) see and edit every site in the org.
 *   2. Clients (site_members) see ONLY sites they have a row for AND only while
 *      that site's client-editing toggle is ON. Flipping the toggle off makes
 *      these queries return nothing — instant, side-effect-free revocation —
 *      and a client never receives any signal that other sites exist.
 */

export type Site = typeof sites.$inferSelect;

export type SiteAccess = {
  site: Site;
  actor: Actor;
};

/**
 * Pure access decision — the isolation rules, extracted from DB I/O so they can
 * be exhaustively unit tested. Returns the effective Actor, or null when the
 * user has no access to the site.
 */
export function decideAccess(input: {
  orgRole: "owner" | "staff" | null;
  /** For agency users: is the site in one of the user's orgs? */
  inUserOrg: boolean;
  clientEditingEnabled: boolean;
  member: {
    role: "client_editor" | "viewer";
    override: MemberPermissionOverride;
  } | null;
}): Actor | null {
  if (input.orgRole) {
    return input.inUserOrg ? { kind: "agency", role: input.orgRole } : null;
  }
  // Client: needs a membership AND the toggle must be ON.
  if (!input.clientEditingEnabled || !input.member) return null;
  return {
    kind: "client",
    role: input.member.role,
    override: input.member.override,
  };
}

async function getOrgRole(
  userId: string,
): Promise<"owner" | "staff" | null> {
  const rows = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .limit(1);
  return rows[0]?.role ?? null;
}

export async function isAgency(userId: string): Promise<boolean> {
  return (await getOrgRole(userId)) !== null;
}

/** Sites the user may see on their dashboard. */
export async function listSitesForUser(userId: string): Promise<Site[]> {
  const orgRole = await getOrgRole(userId);

  if (orgRole) {
    // Agency: all sites in the orgs they belong to.
    const orgs = await db
      .select({ orgId: orgMembers.orgId })
      .from(orgMembers)
      .where(eq(orgMembers.userId, userId));
    const orgIds = orgs.map((o) => o.orgId);
    if (orgIds.length === 0) return [];
    return db.select().from(sites).where(inArray(sites.orgId, orgIds));
  }

  // Client: only invited sites whose client-editing toggle is ON.
  const rows = await db
    .select({ site: sites })
    .from(siteMembers)
    .innerJoin(sites, eq(siteMembers.siteId, sites.id))
    .where(
      and(
        eq(siteMembers.userId, userId),
        eq(sites.clientEditingEnabled, true),
      ),
    );
  return rows.map((r) => r.site);
}

/**
 * Resolve access + the effective Actor for one site, or null if the user has
 * no access (which is indistinguishable, to the client, from the site not
 * existing).
 */
export async function getSiteAccess(
  userId: string,
  siteId: string,
): Promise<SiteAccess | null> {
  const siteRows = await db
    .select()
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  const site = siteRows[0];
  if (!site) return null;

  const orgRole = await getOrgRole(userId);

  let inUserOrg = false;
  if (orgRole) {
    const sameOrg = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(
        and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, site.orgId)),
      )
      .limit(1);
    inUserOrg = sameOrg.length > 0;
  }

  let member:
    | { role: "client_editor" | "viewer"; override: MemberPermissionOverride }
    | null = null;
  if (!orgRole) {
    const memberRows = await db
      .select()
      .from(siteMembers)
      .where(
        and(eq(siteMembers.userId, userId), eq(siteMembers.siteId, siteId)),
      )
      .limit(1);
    if (memberRows[0]) {
      member = {
        role: memberRows[0].role,
        override: (memberRows[0].permissions as MemberPermissionOverride) ?? {},
      };
    }
  }

  const actor = decideAccess({
    orgRole,
    inUserOrg,
    clientEditingEnabled: site.clientEditingEnabled,
    member,
  });
  return actor ? { site, actor } : null;
}
