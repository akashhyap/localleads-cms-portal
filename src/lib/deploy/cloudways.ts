import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";

import { getEnv } from "@/lib/env";
import type { DeployAdapter, DeployContext, PublishStatus } from "./types";

/**
 * Cloudways adapter.
 *
 * Cloudways cannot run build commands, so the real build happens in a GitHub
 * Action in the site repo (see docs/examples/github-actions/deploy.yml): it
 * runs `astro build`, pushes the output to the deploy branch, then calls the
 * Cloudways API to trigger a Git pull. The portal therefore derives publish
 * status from the Action's workflow run for the content commit.
 *
 * config (sites.deployConfig):
 *   workflowFile: string   // e.g. "deploy.yml" (default)
 *   liveUrl?: string       // the site's public URL, for the "Live" link
 */
export class CloudwaysAdapter implements DeployAdapter {
  readonly kind = "cloudways" as const;
  readonly buildsOnPush = false;

  private client(installationId: number): Octokit {
    const env = getEnv();
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: env.GITHUB_APP_ID,
        privateKey: env.GITHUB_APP_PRIVATE_KEY,
        installationId,
      },
    });
  }

  async getStatus(ctx: DeployContext): Promise<PublishStatus> {
    const octokit = this.client(ctx.site.installationId);
    const liveUrl = (ctx.config.liveUrl as string) || undefined;

    // Find the workflow run whose head commit is our content commit.
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner: ctx.site.repoOwner,
      repo: ctx.site.repoName,
      head_sha: ctx.commitSha,
      per_page: 5,
    });

    const run = data.workflow_runs[0];
    if (!run) {
      // Action hasn't registered the commit yet.
      return { state: "queued", detail: "Waiting for build to start" };
    }

    const logUrl = run.html_url;
    if (run.status !== "completed") {
      return { state: "building", detail: run.status ?? "in_progress", logUrl };
    }
    if (run.conclusion === "success") {
      return { state: "live", url: liveUrl, detail: "success", logUrl };
    }
    return {
      state: "failed",
      detail: run.conclusion ?? "failure",
      logUrl,
    };
  }

  /**
   * Optionally trigger the build workflow (e.g. for a manual re-publish). The
   * normal flow is push-triggered by the content commit, so this is only used
   * for explicit "republish" actions.
   */
  async trigger(ctx: DeployContext): Promise<void> {
    const octokit = this.client(ctx.site.installationId);
    const workflowFile = (ctx.config.workflowFile as string) || "deploy.yml";
    await octokit.rest.actions.createWorkflowDispatch({
      owner: ctx.site.repoOwner,
      repo: ctx.site.repoName,
      workflow_id: workflowFile,
      ref: (ctx.config.contentBranch as string) || "main",
    });
  }
}
