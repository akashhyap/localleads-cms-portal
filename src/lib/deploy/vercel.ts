import type { DeployAdapter, DeployContext, PublishStatus } from "./types";

/**
 * Vercel adapter.
 *
 * Vercel builds on push for connected Git projects; we only read status,
 * matched by commit SHA.
 *
 * config (sites.deployConfig):
 *   projectId: string
 *   token: string        // Vercel API token (per-site)
 *   teamId?: string
 *   liveUrl?: string
 */
export class VercelAdapter implements DeployAdapter {
  readonly kind = "vercel" as const;
  readonly buildsOnPush = true;

  async getStatus(ctx: DeployContext): Promise<PublishStatus> {
    const projectId = ctx.config.projectId as string;
    const token = ctx.config.token as string;
    const teamId = ctx.config.teamId as string | undefined;
    const liveUrl = (ctx.config.liveUrl as string) || undefined;

    if (!projectId || !token) {
      return { state: "idle", detail: "Vercel deploy not configured" };
    }

    const params = new URLSearchParams({ projectId, limit: "10" });
    if (teamId) params.set("teamId", teamId);

    const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { state: "failed", detail: `Vercel API ${res.status}` };

    const body = (await res.json()) as {
      deployments?: Array<{
        uid: string;
        url?: string;
        readyState?: string;
        meta?: { githubCommitSha?: string };
      }>;
    };

    const match = body.deployments?.find(
      (d) => d.meta?.githubCommitSha === ctx.commitSha,
    );
    if (!match) return { state: "queued", detail: "Awaiting Vercel build" };

    switch (match.readyState) {
      case "READY":
        return {
          state: "live",
          url: liveUrl ?? (match.url ? `https://${match.url}` : undefined),
          detail: match.readyState,
        };
      case "ERROR":
      case "CANCELED":
        return { state: "failed", detail: match.readyState };
      default:
        return { state: "building", detail: match.readyState ?? "building" };
    }
  }
}
