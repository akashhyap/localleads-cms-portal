/**
 * Permission resolution.
 *
 * Effective permission for an operation on a content type is the intersection
 * of three gates:
 *
 *   schema ceiling  ∩  role defaults  ∩  per-member override
 *
 *   1. schema ceiling   — what the content type allows at all (a singleton
 *                         homepage can never be created/deleted/renamed).
 *   2. role defaults    — what the actor's role grants (agency staff get the
 *                         full ceiling; client editors get edit/create but not
 *                         delete/rename unless explicitly granted).
 *   3. member override  — optional per-site clamp on a client, e.g.
 *                         { contentTypes: { pages: { delete: false } } }.
 *
 * This module is pure (no DB, no network) so it can be exhaustively unit
 * tested. API routes call `resolveContentPermissions` and enforce the result
 * server-side on every mutation.
 */

export const OPERATIONS = ["create", "edit", "delete", "rename"] as const;
export type Operation = (typeof OPERATIONS)[number];

export type OperationSet = Record<Operation, boolean>;

/** What a content type permits at all, declared in portal.yml. */
export type SchemaOperations = Partial<OperationSet>;

/** Who is acting, resolved from org/site membership before this is called. */
export type Actor =
  | { kind: "agency"; role: "owner" | "staff" }
  | {
      kind: "client";
      role: "client_editor" | "viewer";
      /** Optional per-content-type clamp from site_members.permissions. */
      override?: MemberPermissionOverride;
    };

export type MemberPermissionOverride = {
  /** Per content-type-key operation clamps. Absent key => no extra clamp. */
  contentTypes?: Record<string, Partial<OperationSet>>;
  /** Master switch for media uploads/replacements for this member. */
  allowMedia?: boolean;
};

const NONE: OperationSet = {
  create: false,
  edit: false,
  delete: false,
  rename: false,
};

/** Singletons are edit-only by nature; collections allow everything. */
export function defaultSchemaOperations(
  kind: "singleton" | "collection",
): OperationSet {
  return kind === "singleton"
    ? { create: false, edit: true, delete: false, rename: false }
    : { create: true, edit: true, delete: true, rename: true };
}

/** Role-default ceiling before the schema and member overrides are applied. */
function roleDefaults(actor: Actor): OperationSet {
  if (actor.kind === "agency") {
    return { create: true, edit: true, delete: true, rename: true };
  }
  switch (actor.role) {
    case "client_editor":
      // Clients edit and create by default but never destructively act unless
      // explicitly granted per site. This is the "edit pages, never delete"
      // default from the brief.
      return { create: true, edit: true, delete: false, rename: false };
    case "viewer":
      return { ...NONE }; // Phase 2 read-only role.
    default:
      return { ...NONE };
  }
}

function intersect(a: OperationSet, b: Partial<OperationSet>): OperationSet {
  const out = { ...a };
  for (const op of OPERATIONS) {
    if (b[op] === false) out[op] = false;
    else if (b[op] === undefined) continue; // undefined => no clamp
    else out[op] = out[op] && b[op]!;
  }
  return out;
}

export type ResolveInput = {
  actor: Actor;
  contentTypeKey: string;
  /** The content type's declared operations (already merged with defaults). */
  schemaOperations: SchemaOperations;
};

/**
 * Resolve the effective operation set for an actor on one content type.
 */
export function resolveContentPermissions(input: ResolveInput): OperationSet {
  const { actor, contentTypeKey, schemaOperations } = input;

  // Start from the schema ceiling (default-deny for unspecified ops).
  const ceiling: OperationSet = {
    create: schemaOperations.create ?? false,
    edit: schemaOperations.edit ?? false,
    delete: schemaOperations.delete ?? false,
    rename: schemaOperations.rename ?? false,
  };

  let effective = intersect(ceiling, roleDefaults(actor));

  if (actor.kind === "client" && actor.override?.contentTypes) {
    const clamp = actor.override.contentTypes[contentTypeKey];
    if (clamp) effective = intersect(effective, clamp);
  }

  return effective;
}

export function can(
  op: Operation,
  input: ResolveInput,
): boolean {
  return resolveContentPermissions(input)[op];
}

/** Whether the actor may upload/replace media on this site. */
export function canUseMedia(actor: Actor): boolean {
  if (actor.kind === "agency") return true;
  if (actor.role === "viewer") return false;
  return actor.override?.allowMedia ?? true;
}
