/**
 * Repo path safety.
 *
 * Schema-declared paths and editor-supplied filenames are untrusted. Before any
 * read/write we normalise and confirm the target stays inside an allowed base
 * directory — no `..` traversal, no absolute paths, no escaping the content or
 * media roots declared in portal.yml.
 */

/** Normalise a repo-relative POSIX path; reject traversal and absolutes. */
export function normalizeRepoPath(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Empty path");
  }
  // No backslashes, no leading slash, no NUL.
  if (input.includes("\0")) throw new Error("Invalid path");
  const cleaned = input.replace(/\\/g, "/").replace(/^\/+/, "");

  const segments: string[] = [];
  for (const seg of cleaned.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      throw new Error(`Path traversal is not allowed: ${input}`);
    }
    segments.push(seg);
  }
  const result = segments.join("/");
  if (!result) throw new Error(`Invalid path: ${input}`);
  return result;
}

/** True if `child` is the same as or nested within `base`. */
export function isWithin(base: string, child: string): boolean {
  const b = normalizeRepoPath(base);
  const c = normalizeRepoPath(child);
  return c === b || c.startsWith(`${b}/`);
}

/**
 * Assert a path is inside one of the allowed base directories, returning the
 * normalised path. Throws otherwise.
 */
export function assertWithin(allowedBases: string[], path: string): string {
  const normalized = normalizeRepoPath(path);
  const ok = allowedBases.some((base) => isWithin(base, normalized));
  if (!ok) {
    throw new Error(
      `Path "${path}" is outside the allowed directories (${allowedBases.join(", ")})`,
    );
  }
  return normalized;
}

/** Build a safe collection item path from a directory, slug, and pattern. */
export function buildItemPath(
  dir: string,
  filenamePattern: string,
  slug: string,
  format: string,
): string {
  const safeSlug = slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!safeSlug) throw new Error("Slug produces an empty filename");
  const filename = filenamePattern
    .replace("{slug}", safeSlug)
    .replace("{format}", format);
  return assertWithin([dir], `${normalizeRepoPath(dir)}/${filename}`);
}
