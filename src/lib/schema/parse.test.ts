import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { effectiveSchemaOperations, findContentType, parsePortalSchema } from "./parse";

const exampleYaml = readFileSync(
  join(process.cwd(), "docs/examples/portal.yml"),
  "utf8",
);

describe("parsePortalSchema — the shipped example", () => {
  const result = parsePortalSchema(exampleYaml);

  it("parses the reference 30-page local-business schema", () => {
    expect(result.ok).toBe(true);
  });

  it("normalises media size to bytes and applies extension defaults", () => {
    if (!result.ok) throw new Error(result.errors.join("\n"));
    expect(result.schema.media?.maxSize).toBe(4 * 1024 * 1024);
    expect(result.schema.media?.input).toBe("src/assets/uploads");
    expect(result.schema.media?.extensions).toContain("webp");
  });

  it("exposes all four content types", () => {
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const names = result.schema.content.map((c) => c.name);
    expect(names).toEqual(["homepage", "services", "locations", "contact"]);
  });
});

describe("operation ceilings", () => {
  const result = parsePortalSchema(exampleYaml);

  it("singleton homepage is edit-only", () => {
    if (!result.ok) throw new Error("parse failed");
    const homepage = findContentType(result.schema, "homepage")!;
    expect(effectiveSchemaOperations(homepage)).toEqual({
      create: false,
      edit: true,
      delete: false,
      rename: false,
    });
  });

  it("services collection denies delete/rename per explicit operations", () => {
    if (!result.ok) throw new Error("parse failed");
    const services = findContentType(result.schema, "services")!;
    expect(effectiveSchemaOperations(services)).toEqual({
      create: true,
      edit: true,
      delete: false,
      rename: false,
    });
  });
});

describe("validation failures", () => {
  it("rejects invalid YAML", () => {
    const r = parsePortalSchema(":\n  - [unbalanced");
    expect(r.ok).toBe(false);
  });

  it("rejects a select field without options", () => {
    const r = parsePortalSchema(`
version: 1
content:
  - name: page
    label: Page
    type: singleton
    path: x.md
    format: md
    fields:
      - { name: tone, label: Tone, type: select }
`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/select/);
  });

  it("rejects a titleField that is not a declared field", () => {
    const r = parsePortalSchema(`
version: 1
content:
  - name: posts
    label: Posts
    type: collection
    path: src/content/posts
    format: md
    titleField: nope
    fields:
      - { name: title, label: Title, type: string }
`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/titleField/);
  });

  it("rejects duplicate content type names", () => {
    const r = parsePortalSchema(`
version: 1
content:
  - { name: a, label: A, type: singleton, path: a.md, format: md, fields: [{ name: t, label: T, type: string }] }
  - { name: a, label: A2, type: singleton, path: b.md, format: md, fields: [{ name: t, label: T, type: string }] }
`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/duplicate/);
  });
});
