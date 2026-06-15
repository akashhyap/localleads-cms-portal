import { createAppAuth } from "@octokit/auth-app";
import { RequestError } from "@octokit/request-error";
import { Octokit } from "octokit";

import { getEnv } from "@/lib/env";
import {
  ConflictError,
  type DeleteFileInput,
  type DirEntry,
  type FileContent,
  type GitProvider,
  NotFoundError,
  type RepoRef,
  type RepoSummary,
  type WriteFileInput,
  type WriteResult,
} from "./types";

/**
 * GitHub App implementation of the Git provider boundary.
 *
 * All access uses short-lived installation tokens minted from the App's
 * private key (server-side only — no token ever reaches a browser). Octokit
 * instances are cached per installation; Octokit refreshes the underlying
 * installation token automatically before expiry.
 */

const installationClients = new Map<number, Octokit>();

function installationClient(installationId: number): Octokit {
  const cached = installationClients.get(installationId);
  if (cached) return cached;

  const env = getEnv();
  const client = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      installationId,
    },
  });
  installationClients.set(installationId, client);
  return client;
}

function toBase64(content: Uint8Array | string): string {
  const buf =
    typeof content === "string"
      ? Buffer.from(content, "utf8")
      : Buffer.from(content);
  return buf.toString("base64");
}

export class GitHubProvider implements GitProvider {
  async listRepos(installationId: number): Promise<RepoSummary[]> {
    const octokit = installationClient(installationId);
    const repos = await octokit.paginate(
      octokit.rest.apps.listReposAccessibleToInstallation,
      { per_page: 100 },
    );
    return repos.map((r) => ({
      id: r.id,
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
    }));
  }

  async getRepo(installationId: number, repo: RepoRef): Promise<RepoSummary> {
    const octokit = installationClient(installationId);
    const { data } = await octokit.rest.repos.get({
      owner: repo.owner,
      repo: repo.name,
    });
    return {
      id: data.id,
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      private: data.private,
    };
  }

  async getFile(
    installationId: number,
    repo: RepoRef,
    path: string,
    ref?: string,
  ): Promise<FileContent | null> {
    const octokit = installationClient(installationId);
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path,
        ref,
      });
      if (Array.isArray(data) || data.type !== "file") {
        throw new Error(`Path is not a file: ${path}`);
      }
      const bytes = Buffer.from(data.content ?? "", "base64");
      return {
        text: bytes.toString("utf8"),
        bytes: new Uint8Array(bytes),
        sha: data.sha,
        path: data.path,
      };
    } catch (err) {
      if (err instanceof RequestError && err.status === 404) return null;
      throw err;
    }
  }

  async listDir(
    installationId: number,
    repo: RepoRef,
    path: string,
    ref?: string,
  ): Promise<DirEntry[]> {
    const octokit = installationClient(installationId);
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path,
        ref,
      });
      if (!Array.isArray(data)) {
        throw new Error(`Path is not a directory: ${path}`);
      }
      return data.map((e) => ({
        type: e.type === "dir" ? "dir" : "file",
        name: e.name,
        path: e.path,
        sha: e.sha,
        size: e.size,
      }));
    } catch (err) {
      if (err instanceof RequestError && err.status === 404) return [];
      throw err;
    }
  }

  async writeFile(
    installationId: number,
    repo: RepoRef,
    input: WriteFileInput,
  ): Promise<WriteResult> {
    const octokit = installationClient(installationId);
    try {
      const { data } = await octokit.rest.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path: input.path,
        message: input.message,
        content: toBase64(input.content),
        sha: input.sha,
        branch: input.branch,
        author: { name: input.author.name, email: input.author.email },
      });
      return {
        commitSha: data.commit.sha ?? "",
        blobSha: data.content?.sha ?? "",
      };
    } catch (err) {
      // 409: the file moved underneath us. 422 referencing sha: stale/missing
      // base sha for an existing file. Both are optimistic-concurrency losses.
      if (err instanceof RequestError) {
        if (
          err.status === 409 ||
          (err.status === 422 && /sha/i.test(err.message))
        ) {
          throw new ConflictError(input.path);
        }
      }
      throw err;
    }
  }

  async deleteFile(
    installationId: number,
    repo: RepoRef,
    input: DeleteFileInput,
  ): Promise<{ commitSha: string }> {
    const octokit = installationClient(installationId);
    try {
      const { data } = await octokit.rest.repos.deleteFile({
        owner: repo.owner,
        repo: repo.name,
        path: input.path,
        message: input.message,
        sha: input.sha,
        branch: input.branch,
        author: { name: input.author.name, email: input.author.email },
      });
      return { commitSha: data.commit.sha ?? "" };
    } catch (err) {
      if (err instanceof RequestError) {
        if (err.status === 404) throw new NotFoundError(input.path);
        if (err.status === 409) throw new ConflictError(input.path);
      }
      throw err;
    }
  }
}

let singleton: GitHubProvider | null = null;

/** The configured Git provider. GitHub today; swap here for another adapter. */
export function getGitProvider(): GitProvider {
  if (!singleton) singleton = new GitHubProvider();
  return singleton;
}
