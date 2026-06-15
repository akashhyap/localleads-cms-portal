import { describe, expect, it } from "vitest";

import type { Field } from "@/lib/schema/types";
import { parseContentFile, serializeContentFile } from "./serialize";

const mdFields: Field[] = [
  { name: "title", label: "Title", type: "string" },
  { name: "hero_image", label: "Hero", type: "image" },
  { name: "show_reviews", label: "Reviews", type: "boolean" },
  { name: "body", label: "Body", type: "rich-text" },
];

describe("markdown frontmatter round-trip", () => {
  it("reads frontmatter + body", () => {
    const file = `---\ntitle: Welcome\nhero_image: /uploads/hero.jpg\nshow_reviews: true\n---\n\n# Hello\n\nWelcome to our site.\n`;
    const values = parseContentFile("md", file, mdFields);
    expect(values.title).toBe("Welcome");
    expect(values.hero_image).toBe("/uploads/hero.jpg");
    expect(values.show_reviews).toBe(true);
    expect(values.body).toContain("# Hello");
  });

  it("survives a parse -> serialize -> parse cycle", () => {
    const original = {
      title: "Welcome",
      hero_image: "/uploads/hero.jpg",
      show_reviews: false,
      body: "# Hello\n\nBody text here.",
    };
    const serialized = serializeContentFile("md", original, mdFields);
    const reparsed = parseContentFile("md", serialized, mdFields);
    expect(reparsed.title).toBe(original.title);
    expect(reparsed.show_reviews).toBe(false);
    expect((reparsed.body as string).trim()).toBe(original.body.trim());
  });

  it("handles a markdown file with no frontmatter", () => {
    const values = parseContentFile("md", "Just body text.", mdFields);
    expect(values.body).toBe("Just body text.");
  });
});

describe("json round-trip", () => {
  const fields: Field[] = [
    { name: "business_name", label: "Name", type: "string" },
    {
      name: "social",
      label: "Social",
      type: "object",
      fields: [{ name: "facebook", label: "FB", type: "string" }],
    },
  ];

  it("parses and serialises nested objects", () => {
    const values = {
      business_name: "Acme Plumbing",
      social: { facebook: "https://fb.com/acme" },
    };
    const out = serializeContentFile("json", values, fields);
    expect(parseContentFile("json", out, fields)).toEqual(values);
  });

  it("tolerates an empty file", () => {
    expect(parseContentFile("json", "", fields)).toEqual({});
  });
});

describe("yaml data files", () => {
  it("round-trips", () => {
    const fields: Field[] = [{ name: "k", label: "K", type: "string" }];
    const out = serializeContentFile("yaml", { k: "v" }, fields);
    expect(parseContentFile("yaml", out, fields)).toEqual({ k: "v" });
  });
});
