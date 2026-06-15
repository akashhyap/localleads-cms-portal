import { describe, expect, it } from "vitest";

import type { Field } from "@/lib/schema/types";
import { validateValues } from "./validate";

const fields: Field[] = [
  { name: "title", label: "Title", type: "string", required: true, maxLength: 10 },
  { name: "count", label: "Count", type: "number", min: 0, max: 5 },
  {
    name: "tone",
    label: "Tone",
    type: "select",
    options: [{ label: "Friendly", value: "friendly" }],
  },
  {
    name: "faqs",
    label: "FAQs",
    type: "list",
    fields: [{ name: "q", label: "Q", type: "string", required: true }],
  },
];

describe("validateValues", () => {
  it("passes valid input", () => {
    expect(
      validateValues(fields, {
        title: "Hi",
        count: 3,
        tone: "friendly",
        faqs: [{ q: "What?" }],
      }),
    ).toEqual([]);
  });

  it("flags missing required field", () => {
    const errs = validateValues(fields, {});
    expect(errs.some((e) => e.path === "title")).toBe(true);
  });

  it("enforces maxLength and numeric bounds", () => {
    const errs = validateValues(fields, { title: "way too long here", count: 9 });
    expect(errs.some((e) => /exceeds/.test(e.message))).toBe(true);
    expect(errs.some((e) => /≤ 5/.test(e.message))).toBe(true);
  });

  it("rejects select values outside options", () => {
    const errs = validateValues(fields, { title: "ok", tone: "rude" });
    expect(errs.some((e) => e.path === "tone")).toBe(true);
  });

  it("recurses into list items", () => {
    const errs = validateValues(fields, { title: "ok", faqs: [{ q: "" }] });
    expect(errs.some((e) => e.path === "faqs[0].q")).toBe(true);
  });
});
