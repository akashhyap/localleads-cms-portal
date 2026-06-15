import type { DeployAdapter, DeployContext, PublishStatus } from "./types";

/**
 * Cloudflare Pages adapter.
 *
 * CF Pages builds on push via its native Git integration, so we only read
 * status. Deployments are matched by commit SHA.
 *
 * config (sites.deployConfig):
 *   accountId: string
 *   projectName: string
 *   apiToken: string   // a CF API token with Pages:read; stored per-site
 *   liveUrl?: string
 */
export class CloudflarePagesAdapter implements DeployAdapter {
  readonly kind = "cloudflare" as const;
  readonly buildsOnPush = true;

  async getStatus(ctx: DeployContext): Promise<PublishStatus> {
    const accountId = ctx.config.accountId as string;
    const projectName = ctx.config.projectName as string;
    const apiToken = ctx.config.apiToken as string;
    const liveUrl = (ctx.config.liveUrl as string) || undefined;

    if (!accountId || !projectName || !apiToken) {
      return { state: "idle", detail: "Cloudflare deploy not configured" };
    }

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    );
    if (!res.ok) {
      return { state: "failed", detail: `Cloudflare API ${res.status}` };
    }
    const body = (await res.json()) as {
      result?: Array<{
        id: string;
        url?: string;
        deployment_trigger?: { metadata?: { commit_hash?: string } };
        latest_stage?: { name?: string; status?: string };
      }>;
    };

    const match = body.result?.find(
      (d) =>
        d.deployment_trigger?.metadata?.commit_hash?.startsWith(
          ctx.commitSha.slice(0, 8),
        ),
    );
    if (!match) return { state: "queued", detail: "Awaiting Cloudflare build" };

    const stage = match.latest_stage;
    if (stage?.status === "success") {
      return { state: "live", url: liveUrl ?? match.url, detail: stage.name };
    }
    if (stage?.status === "failure") {
      return { state: "failed", detail: stage.name };
    }
    return { state: "building", detail: stage?.name ?? "building" };
  }
}
