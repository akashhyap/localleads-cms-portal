/**
 * Deploy-target boundary.
 *
 * The portal's job ends at the commit, but editors must see status move
 * Saving -> Publishing -> Live. Each host is an adapter so adding one later is
 * a new file, never a refactor. Adapters are read-mostly: they report status
 * for a commit and, where a host can't build on push (Cloudways), optionally
 * trigger the deploy.
 */

export type PublishState = "idle" | "queued" | "building" | "live" | "failed";

export type PublishStatus = {
  state: PublishState;
  /** Live URL once known. */
  url?: string;
  /** Provider-native status string for display/debugging. */
  detail?: string;
  /** Link to the build/deploy log (GitHub Actions run, CF/Vercel deploy). */
  logUrl?: string;
};

export type DeployContext = {
  site: {
    id: string;
    installationId: number;
    repoOwner: string;
    repoName: string;
  };
  /** Adapter-specific config from sites.deployConfig. */
  config: Record<string, unknown>;
  /** The commit we want status for. */
  commitSha: string;
};

export interface DeployAdapter {
  readonly kind: "cloudways" | "cloudflare" | "vercel" | "none";
  /** Whether this host can build on push by itself. */
  readonly buildsOnPush: boolean;
  /** Report the publish status for a commit. */
  getStatus(ctx: DeployContext): Promise<PublishStatus>;
  /**
   * Optionally kick a deploy. No-op for hosts that build on push. For
   * Cloudways this triggers the Git pull on the app after the build branch
   * updates.
   */
  trigger?(ctx: DeployContext): Promise<void>;
}
