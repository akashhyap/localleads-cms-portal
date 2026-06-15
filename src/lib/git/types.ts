/**
 * Git provider boundary.
 *
 * Everything that touches a repo goes through this interface so GitHub is the
 * only concrete implementation today, and GitLab/Gitea can be added later as a
 * new adapter rather than a refactor. No provider-specific types (Octokit,
 * etc.) may leak past this module.
 */

export type RepoRef = {
  owner: string;
  name: string;
};

export type RepoSummary = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
};

export type FileContent = {
  /** UTF-8 decoded file contents. */
  text: string;
  /** Raw bytes (for media). */
  bytes: Uint8Array;
  /** Blob SHA — the optimistic-concurrency anchor. */
  sha: string;
  path: string;
};

export type DirEntry = {
  type: "file" | "dir";
  name: string;
  path: string;
  sha: string;
  size: number;
};

export type CommitAuthor = {
  /** Human attribution, e.g. the editor's email. */
  name: string;
  email: string;
};

export type WriteFileInput = {
  branch: string;
  path: string;
  /** Raw content; encoded to base64 by the adapter. */
  content: Uint8Array | string;
  message: string;
  /**
   * Blob SHA the editor loaded. Required when updating an existing file;
   * omitted when creating. A mismatch must raise `ConflictError`.
   */
  sha?: string;
  author: CommitAuthor;
};

export type WriteResult = {
  commitSha: string;
  /** New blob SHA after the write (the next base SHA). */
  blobSha: string;
};

export type DeleteFileInput = {
  branch: string;
  path: string;
  sha: string;
  message: string;
  author: CommitAuthor;
};

/** Thrown when a write's base SHA no longer matches the repo (lost update). */
export class ConflictError extends Error {
  constructor(
    public readonly path: string,
    message = "File changed in the repository since it was loaded",
  ) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Thrown when a requested file does not exist. */
export class NotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`Not found: ${path}`);
    this.name = "NotFoundError";
  }
}

export interface GitProvider {
  /** Repos the given installation can access. */
  listRepos(installationId: number): Promise<RepoSummary[]>;

  getRepo(installationId: number, repo: RepoRef): Promise<RepoSummary>;

  /** Read a file at a ref. Returns null if absent. */
  getFile(
    installationId: number,
    repo: RepoRef,
    path: string,
    ref?: string,
  ): Promise<FileContent | null>;

  /** List a directory's entries (for collections + media browsing). */
  listDir(
    installationId: number,
    repo: RepoRef,
    path: string,
    ref?: string,
  ): Promise<DirEntry[]>;

  /** Create or update a file with optimistic concurrency. */
  writeFile(
    installationId: number,
    repo: RepoRef,
    input: WriteFileInput,
  ): Promise<WriteResult>;

  deleteFile(
    installationId: number,
    repo: RepoRef,
    input: DeleteFileInput,
  ): Promise<{ commitSha: string }>;
}
