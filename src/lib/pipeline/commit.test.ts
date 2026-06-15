import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/git/types";

// --- Mock the data + git boundaries so we can test pipeline behaviour ---

const writeFile = vi.fn();
const deleteFile = vi.fn();
const jobUpdates: Array<Record<string, unknown>> = [];
const auditCalls: Array<Record<string, unknown>> = [];

vi.mock("@/lib/git/github", () => ({
  getGitProvider: () => ({ writeFile, deleteFile }),
}));

vi.mock("@/lib/audit", () => ({
  recordAudit: (entry: Record<string, unknown>) => {
    auditCalls.push(entry);
    return Promise.resolve();
  },
}));

function chainableUpdate() {
  return {
    set: (vals: Record<string, unknown>) => {
      jobUpdates.push(vals);
      return { where: () => Promise.resolve() };
    },
  };
}

const txLike = {
  execute: () => Promise.resolve(),
  update: () => chainableUpdate(),
  insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
};

vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: () => ({ returning: () => Promise.resolve([{ id: "job-1" }]) }),
    }),
    update: () => chainableUpdate(),
    transaction: (cb: (tx: typeof txLike) => Promise<unknown>) => cb(txLike),
  },
}));

import { commitFileWrite } from "./commit";

const site = {
  id: "site-1",
  installationId: 42,
  repoOwner: "agency",
  repoName: "client-site",
  branch: "main",
};
const actor = { id: "user-1", email: "mike@client.com", name: "Mike" };

beforeEach(() => {
  writeFile.mockReset();
  deleteFile.mockReset();
  jobUpdates.length = 0;
  auditCalls.length = 0;
});

describe("commitFileWrite", () => {
  it("commits, records audit, returns the new SHAs", async () => {
    writeFile.mockResolvedValue({ commitSha: "c0ffee", blobSha: "b10b" });

    const out = await commitFileWrite({
      site,
      actor,
      filePath: "src/content/pages/home.md",
      content: "---\ntitle: Hi\n---\n",
      baseSha: "old-sha",
      message: "content: update homepage — by mike@client.com via portal",
      auditAction: "content.update",
      summary: "Updated title",
    });

    expect(out).toEqual({
      ok: true,
      commitSha: "c0ffee",
      blobSha: "b10b",
      jobId: "job-1",
    });
    // base SHA forwarded for optimistic concurrency
    expect(writeFile.mock.calls[0][2].sha).toBe("old-sha");
    // human attribution preserved
    expect(writeFile.mock.calls[0][2].author).toEqual({
      name: "Mike",
      email: "mike@client.com",
    });
    expect(auditCalls).toHaveLength(1);
    expect(jobUpdates.some((u) => u.status === "committed")).toBe(true);
  });

  it("surfaces a conflict without clobbering and marks the job", async () => {
    writeFile.mockRejectedValue(new ConflictError("src/content/pages/home.md"));

    const out = await commitFileWrite({
      site,
      actor,
      filePath: "src/content/pages/home.md",
      content: "x",
      baseSha: "stale",
      message: "m",
      auditAction: "content.update",
    });

    expect(out).toEqual({ ok: false, conflict: true, jobId: "job-1" });
    expect(jobUpdates.some((u) => u.status === "conflict")).toBe(true);
    expect(auditCalls).toHaveLength(0);
  });

  it("marks the job failed and rethrows on unexpected errors", async () => {
    writeFile.mockRejectedValue(new Error("network boom"));

    await expect(
      commitFileWrite({
        site,
        actor,
        filePath: "x.md",
        content: "x",
        message: "m",
        auditAction: "content.update",
      }),
    ).rejects.toThrow(/boom/);
    expect(jobUpdates.some((u) => u.status === "failed")).toBe(true);
  });
});
