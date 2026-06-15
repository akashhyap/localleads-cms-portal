import { and, desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { error, json, requireSiteAccess, route } from "@/lib/api/context";
import { db } from "@/lib/db";
import { commitJobs } from "@/lib/db/schema";
import { getDeployAdapter } from "@/lib/deploy";

type Ctx = { params: Promise<{ siteId: string }> };

/**
 * Publish status for a commit (Saving -> Publishing -> Live). Defaults to the
 * site's most recent committed write if no ?commit= is given.
 */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { siteId } = await ctx.params;
  const { access } = await requireSiteAccess(siteId);

  let commitSha = req.nextUrl.searchParams.get("commit") ?? "";
  if (!commitSha) {
    const recent = await db
      .select({ sha: commitJobs.resultCommitSha })
      .from(commitJobs)
      .where(and(eq(commitJobs.siteId, siteId), eq(commitJobs.status, "committed")))
      .orderBy(desc(commitJobs.updatedAt))
      .limit(1);
    commitSha = recent[0]?.sha ?? "";
  }
  if (!commitSha) return json({ status: { state: "idle", detail: "Nothing published yet" } });

  const adapter = getDeployAdapter(access.site.deployAdapter);
  try {
    const status = await adapter.getStatus({
      site: {
        id: access.site.id,
        installationId: access.site.githubInstallationId,
        repoOwner: access.site.repoOwner,
        repoName: access.site.repoName,
      },
      config: { ...(access.site.deployConfig as Record<string, unknown>), contentBranch: access.site.contentBranch },
      commitSha,
    });
    return json({ status, commitSha });
  } catch (err) {
    return error(502, `Could not read deploy status: ${(err as Error).message}`);
  }
});
