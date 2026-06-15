import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  error,
  json,
  requireAgencyUser,
  requireUser,
  route,
} from "@/lib/api/context";
import { rateLimit } from "@/lib/api/rate-limit";
import { listSitesForUser } from "@/lib/auth/access";
import { getDefaultOrg, registerSite } from "@/lib/sites/service";

/** List sites the caller may see (agency: all; client: only invited + enabled). */
export const GET = route(async () => {
  const user = await requireUser();
  const sites = await listSitesForUser(user.id);
  return json({
    sites: sites.map((s) => ({
      id: s.id,
      name: s.name,
      repo: `${s.repoOwner}/${s.repoName}`,
      deployAdapter: s.deployAdapter,
      clientEditingEnabled: s.clientEditingEnabled,
    })),
  });
});

const registerSchema = z.object({
  name: z.string().min(1),
  installationId: z.number().int().positive(),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  contentBranch: z.string().optional(),
  schemaPath: z.string().optional(),
});

/** Register a repo as a site (agency only). Validates portal.yml first. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireAgencyUser();
  rateLimit(`register:${user.id}`, { limit: 10, windowMs: 60_000 });

  const body = registerSchema.safeParse(await req.json());
  if (!body.success) return error(400, body.error.issues[0]?.message ?? "Invalid body");

  const org = await getDefaultOrg();
  if (!org) return error(500, "No organization configured — run the seed script");

  const result = await registerSite({
    orgId: org.id,
    actor: { id: user.id, email: user.email },
    ...body.data,
  });
  if (!result.ok) return json({ error: "Invalid schema", details: result.errors }, { status: 422 });
  return json({ siteId: result.siteId }, { status: 201 });
});
