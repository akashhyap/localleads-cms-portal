import type { NextRequest } from "next/server";

import { error, json, requireAgencyUser, route } from "@/lib/api/context";
import { listInstallationRepos } from "@/lib/sites/service";

/** List repos accessible to a GitHub App installation (agency only). */
export const GET = route(async (req: NextRequest) => {
  await requireAgencyUser();
  const installationId = Number(req.nextUrl.searchParams.get("installationId"));
  if (!installationId) return error(400, "installationId is required");
  const repos = await listInstallationRepos(installationId);
  return json({ repos });
});
