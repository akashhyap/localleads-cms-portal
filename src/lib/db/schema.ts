import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Portal data model.
 *
 * Hard rule: this database NEVER stores site content or media. The Git repo is
 * the single source of truth for those. Here we keep only accounts, the
 * org -> sites -> members graph, invites, deploy config, the commit job queue,
 * and the append-only audit log. If this database vanished, every website and
 * all its content would remain intact in GitHub.
 *
 * The model is intentionally multi-tenant-ready (organizations at the root) even
 * though we run a single agency org today, so commercialisation later is a
 * settings change rather than a rewrite.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Agency-level role. Owner == superuser; staff == full operational access. */
export const orgRoleEnum = pgEnum("org_role", ["owner", "staff"]);

/**
 * Site-scoped role for invited people (clients). Kept as an enum so Phase 2's
 * read-only "viewer" upsell role is an additive migration, not a redesign.
 */
export const siteRoleEnum = pgEnum("site_role", ["client_editor", "viewer"]);

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
]);

/** Which deploy adapter governs a site's publish flow. */
export const deployAdapterEnum = pgEnum("deploy_adapter", [
  "cloudways",
  "cloudflare",
  "vercel",
  "none",
]);

/** Lifecycle of a single queued write to a repo. */
export const commitJobStatusEnum = pgEnum("commit_job_status", [
  "queued", // accepted, not yet attempted
  "processing", // a worker holds it
  "committed", // write landed in Git
  "conflict", // base SHA moved underneath us; needs editor reload
  "failed", // exhausted retries / unrecoverable
]);

/** Publish lifecycle surfaced to editors as Saving -> Publishing -> Live. */
export const publishStatusEnum = pgEnum("publish_status", [
  "idle",
  "queued",
  "building",
  "live",
  "failed",
]);

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * Mirror of a Supabase `auth.users` row. We do not FK into the auth schema
 * (it lives outside our migrations); instead the id IS the auth user id and a
 * profile row is created on first authenticated request.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // == auth.users.id
  email: text("email").notNull(),
  fullName: text("full_name"),
  // Convenience flag: true for any agency owner/staff. Authoritative agency
  // access is still resolved through org_members; this is a fast-path hint.
  isStaff: boolean("is_staff").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [uniqueIndex("organizations_slug_key").on(t.slug)]);

/** Agency staff/owners. Membership here = "can see every site in the org". */
export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("staff"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("org_members_org_user_key").on(t.orgId, t.userId)],
);

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),

    // --- GitHub binding ---
    githubInstallationId: integer("github_installation_id").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    // Content branch (source of truth for editable content). Built artifacts
    // live on a separate deploy branch so build commits never collide with the
    // optimistic-concurrency checks on content writes.
    contentBranch: text("content_branch").notNull().default("main"),
    schemaPath: text("schema_path").notNull().default("portal.yml"),

    // Cached parsed schema + the blob SHA it was read at. Treated as a cache
    // only; never authoritative over the repo.
    schemaJson: jsonb("schema_json"),
    schemaSha: text("schema_sha"),
    schemaSyncedAt: timestamp("schema_synced_at", { withTimezone: true }),

    // --- Client access upsell switch (OFF by default) ---
    clientEditingEnabled: boolean("client_editing_enabled")
      .notNull()
      .default(false),

    // --- Deploy / publish ---
    deployAdapter: deployAdapterEnum("deploy_adapter")
      .notNull()
      .default("none"),
    // Adapter-specific, non-secret config (ids, branch names, workflow file).
    // Real secrets belong in env / a secret store, referenced by key here.
    deployConfig: jsonb("deploy_config").notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sites_repo_key").on(t.repoOwner, t.repoName),
    index("sites_org_idx").on(t.orgId),
  ],
);

/**
 * Site-scoped membership for invited people (clients). This row IS the
 * isolation boundary: a client sees exactly the sites they have a row for and
 * has no signal that other sites exist.
 *
 * `permissions` optionally clamps the schema-declared operation ceiling per
 * content type, e.g. { contentTypes: { pages: { delete: false } } }.
 */
export const siteMembers = pgTable(
  "site_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: siteRoleEnum("role").notNull().default("client_editor"),
    permissions: jsonb("permissions").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("site_members_site_user_key").on(t.siteId, t.userId)],
);

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: siteRoleEnum("role").notNull().default("client_editor"),
    permissions: jsonb("permissions").notNull().default(sql`'{}'::jsonb`),
    // Random opaque token; we store only its SHA-256 hash, never the raw value.
    tokenHash: text("token_hash").notNull(),
    status: inviteStatusEnum("status").notNull().default("pending"),
    invitedBy: uuid("invited_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("invites_token_hash_key").on(t.tokenHash),
    index("invites_site_email_idx").on(t.siteId, t.email),
  ],
);

// ---------------------------------------------------------------------------
// Write pipeline: the commit job queue
// ---------------------------------------------------------------------------

/**
 * One queued write to a repo. The happy path is committed inline within the
 * request for instant UX, but the row is durable so conflicts/rate-limits can
 * be retried out of band and so every attempt is auditable. Writes to the same
 * (site, filePath) are serialised to prevent lost updates.
 */
export const commitJobs = pgTable(
  "commit_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email").notNull(),

    filePath: text("file_path").notNull(),
    // The blob SHA the editor loaded; the optimistic-concurrency anchor.
    baseSha: text("base_sha"),
    // Serialized intent: encoded content, message, optional rename target, etc.
    payload: jsonb("payload").notNull(),

    status: commitJobStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    resultCommitSha: text("result_commit_sha"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("commit_jobs_site_status_idx").on(t.siteId, t.status),
    index("commit_jobs_file_idx").on(t.siteId, t.filePath),
  ],
);

// ---------------------------------------------------------------------------
// Audit log (append-only)
// ---------------------------------------------------------------------------

/**
 * Append-only record of everything that mutates a site. Never updated or
 * deleted (enforced at the policy layer + a DB rule in migrations). Diff
 * summaries are stored, not full content, to keep the repo as source of truth.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    // e.g. "content.update", "media.upload", "invite.create", "site.register".
    action: text("action").notNull(),
    filePath: text("file_path"),
    commitSha: text("commit_sha"),
    summary: text("summary"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_site_idx").on(t.siteId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(orgMembers),
  sites: many(sites),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  org: one(organizations, {
    fields: [orgMembers.orgId],
    references: [organizations.id],
  }),
  user: one(profiles, {
    fields: [orgMembers.userId],
    references: [profiles.id],
  }),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  org: one(organizations, {
    fields: [sites.orgId],
    references: [organizations.id],
  }),
  members: many(siteMembers),
  invites: many(invites),
}));

export const siteMembersRelations = relations(siteMembers, ({ one }) => ({
  site: one(sites, { fields: [siteMembers.siteId], references: [sites.id] }),
  user: one(profiles, {
    fields: [siteMembers.userId],
    references: [profiles.id],
  }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  site: one(sites, { fields: [invites.siteId], references: [sites.id] }),
}));
