import { parse as parseYaml } from "yaml";

import {
  defaultSchemaOperations,
  type OperationSet,
} from "@/lib/permissions";
import { type ContentType, type PortalSchema, portalSchema } from "./types";

export type ParseSuccess = {
  ok: true;
  schema: PortalSchema;
};

export type ParseFailure = {
  ok: false;
  errors: string[];
};

export type ParseResult = ParseSuccess | ParseFailure;

/**
 * Parse and validate a `portal.yml` document.
 *
 * Returns a discriminated result rather than throwing so callers (the Add Site
 * flow, the editor) can surface clean validation errors to staff. Content from
 * a repo is untrusted input; this is the only place it becomes a typed schema.
 */
export function parsePortalSchema(yamlText: string): ParseResult {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    return {
      ok: false,
      errors: [`YAML syntax error: ${(err as Error).message}`],
    };
  }

  const parsed = portalSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    };
  }

  // Cross-field validation that's awkward in zod: unique content names, and
  // titleField references a real field on collections.
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const ct of parsed.data.content) {
    if (seen.has(ct.name)) errors.push(`duplicate content type name "${ct.name}"`);
    seen.add(ct.name);
    if (ct.type === "collection" && ct.titleField) {
      const hasField = ct.fields.some((f) => f.name === ct.titleField);
      if (!hasField) {
        errors.push(
          `content type "${ct.name}": titleField "${ct.titleField}" is not a declared field`,
        );
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  return { ok: true, schema: parsed.data };
}

/**
 * The fully-resolved operation ceiling for a content type: explicit
 * `operations` in the schema override the by-kind defaults (singleton =>
 * edit-only, collection => all).
 */
export function effectiveSchemaOperations(ct: ContentType): OperationSet {
  const defaults = defaultSchemaOperations(ct.type);
  if (!ct.operations) return defaults;
  return { ...defaults, ...ct.operations };
}

export function findContentType(
  schema: PortalSchema,
  name: string,
): ContentType | undefined {
  return schema.content.find((c) => c.name === name);
}
