import { CloudflarePagesAdapter } from "./cloudflare";
import { CloudwaysAdapter } from "./cloudways";
import type { DeployAdapter } from "./types";
import { VercelAdapter } from "./vercel";

/** A no-op adapter for sites with no deploy target configured yet. */
class NoneAdapter implements DeployAdapter {
  readonly kind = "none" as const;
  readonly buildsOnPush = true;
  async getStatus() {
    return { state: "idle" as const, detail: "No deploy target configured" };
  }
}

const adapters: Record<string, () => DeployAdapter> = {
  cloudways: () => new CloudwaysAdapter(),
  cloudflare: () => new CloudflarePagesAdapter(),
  vercel: () => new VercelAdapter(),
  none: () => new NoneAdapter(),
};

export function getDeployAdapter(kind: string): DeployAdapter {
  const factory = adapters[kind] ?? adapters.none;
  return factory();
}

export type { DeployAdapter, DeployContext, PublishStatus, PublishState } from "./types";
