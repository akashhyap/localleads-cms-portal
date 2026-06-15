import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { ContentFormat, Field } from "@/lib/schema/types";

/**
 * Bidirectional mapping between a content type's field-tree values and the
 * bytes stored in the repo.
 *
 * Conventions:
 *  - md / mdx: scalar fields live in YAML frontmatter; the single field named
 *    `body` (if present) becomes the Markdown body below the frontmatter.
 *  - json / yaml: the whole value tree serialises to a structured data file.
 *
 * The `body` convention keeps Markdown files human-editable in Git while still
 * giving the editor a rich-text surface.
 */

export const BODY_FIELD = "body";

export type ContentValues = Record<string, unknown>;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseContentFile(
  format: ContentFormat,
  text: string,
  fields: Field[],
): ContentValues {
  switch (format) {
    case "json": {
      const data = text.trim() ? JSON.parse(text) : {};
      return asRecord(data);
    }
    case "yaml": {
      const data = text.trim() ? parseYaml(text) : {};
      return asRecord(data);
    }
    case "md":
    case "mdx": {
      const match = FRONTMATTER_RE.exec(text);
      const hasBodyField = fields.some((f) => f.name === BODY_FIELD);
      if (!match) {
        // No frontmatter: treat the whole file as the body if a body field
        // exists, otherwise as empty data.
        return hasBodyField ? { [BODY_FIELD]: text } : {};
      }
      const front = match[1].trim() ? asRecord(parseYaml(match[1])) : {};
      const body = match[2] ?? "";
      if (hasBodyField) front[BODY_FIELD] = body.replace(/^\r?\n/, "");
      return front;
    }
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

export function serializeContentFile(
  format: ContentFormat,
  values: ContentValues,
  fields: Field[],
): string {
  switch (format) {
    case "json":
      return JSON.stringify(values, null, 2) + "\n";
    case "yaml":
      return stringifyYaml(values);
    case "md":
    case "mdx": {
      const hasBodyField = fields.some((f) => f.name === BODY_FIELD);
      if (!hasBodyField) {
        // Pure data in a markdown file: emit frontmatter only.
        return frontmatterBlock(values);
      }
      const { [BODY_FIELD]: body, ...front } = values;
      const fm = frontmatterBlock(front);
      const bodyText = typeof body === "string" ? body : "";
      return `${fm}\n${bodyText.replace(/^\r?\n/, "")}`.replace(/\s*$/, "\n");
    }
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function frontmatterBlock(data: ContentValues): string {
  const yaml = Object.keys(data).length ? stringifyYaml(data) : "";
  return `---\n${yaml}---\n`;
}

function asRecord(value: unknown): ContentValues {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ContentValues;
  }
  return {};
}
