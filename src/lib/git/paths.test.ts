import { describe, expect, it } from "vitest";

import { assertWithin, buildItemPath, isWithin, normalizeRepoPath } from "./paths";

describe("normalizeRepoPath", () => {
  it("strips leading slashes and dot segments", () => {
    expect(normalizeRepoPath("/src/./content/home.md")).toBe(
      "src/content/home.md",
    );
  });

  it("rejects traversal", () => {
    expect(() => normalizeRepoPath("src/../../etc/passwd")).toThrow(/traversal/);
  });

  it("rejects NUL bytes", () => {
    expect(() => normalizeRepoPath("src/\0/x")).toThrow(/Invalid/);
  });
});

describe("isWithin / assertWithin", () => {
  it("accepts nested paths", () => {
    expect(isWithin("src/content", "src/content/services/a.md")).toBe(true);
    expect(isWithin("src/content", "src/content")).toBe(true);
  });

  it("rejects sibling escapes", () => {
    expect(isWithin("src/content", "src/contentX/a.md")).toBe(false);
    expect(isWithin("src/content", "src/assets/a.png")).toBe(false);
  });

  it("assertWithin throws when outside all bases", () => {
    expect(() =>
      assertWithin(["src/content", "src/assets"], "config/secrets.env"),
    ).toThrow(/outside/);
  });

  it("assertWithin returns the normalised path when inside", () => {
    expect(assertWithin(["src/content"], "/src/content/./home.md")).toBe(
      "src/content/home.md",
    );
  });
});

describe("buildItemPath", () => {
  it("slugifies and applies the filename pattern", () => {
    expect(
      buildItemPath("src/content/services", "{slug}.md", "Drain Cleaning!", "md"),
    ).toBe("src/content/services/drain-cleaning.md");
  });

  it("supports {format} in the pattern", () => {
    expect(
      buildItemPath("src/content/data", "{slug}.{format}", "Foo Bar", "json"),
    ).toBe("src/content/data/foo-bar.json");
  });

  it("cannot escape the collection directory via slug", () => {
    // Slug is sanitised to [a-z0-9-], so traversal characters are stripped.
    expect(
      buildItemPath("src/content/services", "{slug}.md", "../../evil", "md"),
    ).toBe("src/content/services/evil.md");
  });
});
