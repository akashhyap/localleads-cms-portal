import { NextResponse } from "next/server";

import { getSiteAccess, isAgency, type SiteAccess } from "@/lib/auth/access";
import { getAuthUser, type AuthUser } from "@/lib/auth/session";
import {
  PermissionDeniedError,
  ValidationError,
} from "@/lib/content/service";
import { ConflictError, NotFoundError } from "@/lib/git/types";

/**
 * Request helpers for route handlers. Authorization is always resolved here,
 * server-side, before any repo I/O.
 */

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Resolve the authenticated user or throw a 401. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new ApiError(401, "Authentication required");
  return user;
}

/** Require the caller to be agency staff/owner. */
export async function requireAgencyUser(): Promise<AuthUser> {
  const user = await requireUser();
  if (!(await isAgency(user.id))) throw new ApiError(403, "Staff access required");
  return user;
}

/**
 * Resolve site access for the current user or throw. A client with no access
 * gets a 404 (indistinguishable from the site not existing — no leakage that
 * other sites are out there).
 */
export async function requireSiteAccess(
  siteId: string,
): Promise<{ user: AuthUser; access: SiteAccess }> {
  const user = await requireUser();
  const access = await getSiteAccess(user.id, siteId);
  if (!access) throw new ApiError(404, "Not found");
  return { user, access };
}

/** Wrap a handler so domain errors map to clean HTTP responses. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) return error(err.status, err.message);
      if (err instanceof PermissionDeniedError) return error(403, err.message);
      if (err instanceof ValidationError) {
        return json({ error: "Validation failed", details: err.errors }, { status: 422 });
      }
      if (err instanceof ConflictError) {
        return json(
          { error: "conflict", message: "This file changed in GitHub since you loaded it. Reload and try again.", path: err.path },
          { status: 409 },
        );
      }
      if (err instanceof NotFoundError) return error(404, err.message);
      console.error("Unhandled API error:", err);
      return error(500, "Internal error");
    }
  };
}
