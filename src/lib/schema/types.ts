import { z } from "zod";

import { OPERATIONS } from "@/lib/permissions";

/**
 * `portal.yml` schema definition + validation.
 *
 * This declares what the portal may edit in a site repo. It travels WITH the
 * site (baked into our Astro starter), so the portal database never owns the
 * notion of "what is editable" — the repo does. The parser below is the single
 * gate that turns untrusted YAML from a repo into a typed, safe config.
 */

// ---------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------

export const FIELD_TYPES = [
  "string",
  "text",
  "rich-text",
  "image",
  "boolean",
  "select",
  "number",
  "date",
  "list", // repeater of sub-fields
  "object", // a fixed group of sub-fields
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type SelectOption = { label: string; value: string };

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  help?: string;
  required?: boolean;
  default?: unknown;
  // select
  options?: SelectOption[];
  multiple?: boolean;
  // number
  min?: number;
  max?: number;
  step?: number;
  // string/text
  maxLength?: number;
  // list/object
  fields?: Field[];
};

const selectOptionSchema = z.union([
  z.string().transform((value) => ({ label: value, value })),
  z.object({ label: z.string(), value: z.string() }),
]);

// Recursive field schema (list/object nest fields).
export const fieldSchema: z.ZodType<Field> = z.lazy(() =>
  z
    .object({
      name: z
        .string()
        .min(1)
        .regex(/^[a-zA-Z0-9_]+$/, "field name must be alphanumeric/underscore"),
      label: z.string().min(1),
      type: z.enum(FIELD_TYPES),
      help: z.string().optional(),
      required: z.boolean().optional(),
      default: z.unknown().optional(),
      options: z.array(selectOptionSchema).optional(),
      multiple: z.boolean().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
      maxLength: z.number().int().positive().optional(),
      fields: z.array(fieldSchema).optional(),
    })
    .superRefine((field, ctx) => {
      if (field.type === "select" && (!field.options || field.options.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `select field "${field.name}" must declare options`,
        });
      }
      if ((field.type === "list" || field.type === "object") && (!field.fields || field.fields.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field.type} field "${field.name}" must declare nested fields`,
        });
      }
    }),
);

// ---------------------------------------------------------------------------
// Content types
// ---------------------------------------------------------------------------

const operationsSchema = z
  .object(Object.fromEntries(OPERATIONS.map((op) => [op, z.boolean()])) as Record<
    (typeof OPERATIONS)[number],
    z.ZodBoolean
  >)
  .partial();

const baseContentType = {
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/, "content type name must be lowercase slug"),
  label: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(fieldSchema).min(1),
  operations: operationsSchema.optional(),
};

export const FORMATS = ["md", "mdx", "json", "yaml"] as const;
export type ContentFormat = (typeof FORMATS)[number];

const singletonSchema = z.object({
  ...baseContentType,
  type: z.literal("singleton"),
  // A single file in the repo.
  path: z.string().min(1),
  format: z.enum(FORMATS),
});

const collectionSchema = z.object({
  ...baseContentType,
  type: z.literal("collection"),
  // A directory the collection lives in.
  path: z.string().min(1),
  format: z.enum(FORMATS),
  // Pattern for new item filenames, e.g. "{slug}.md".
  filename: z.string().default("{slug}.{format}"),
  // Which field renders as the row label in lists.
  titleField: z.string().optional(),
});

export const contentTypeSchema = z.discriminatedUnion("type", [
  singletonSchema,
  collectionSchema,
]);

export type SingletonType = z.infer<typeof singletonSchema>;
export type CollectionType = z.infer<typeof collectionSchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;

// ---------------------------------------------------------------------------
// Media + root
// ---------------------------------------------------------------------------

const sizeSchema = z
  .union([z.number().int().positive(), z.string()])
  .transform((value) => {
    if (typeof value === "number") return value;
    const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb)?$/i.exec(value.trim());
    if (!match) throw new Error(`invalid size: ${value}`);
    const n = parseFloat(match[1]);
    const unit = (match[2] ?? "b").toLowerCase();
    const mult = unit === "mb" ? 1024 * 1024 : unit === "kb" ? 1024 : 1;
    return Math.round(n * mult);
  });

export const mediaSchema = z.object({
  // Repo directory where uploads are committed.
  input: z.string().min(1),
  // Public path content references resolve to (Astro-served).
  output: z.string().min(1),
  extensions: z
    .array(z.string())
    .default(["jpg", "jpeg", "png", "webp", "svg", "avif"]),
  // Normalised to bytes.
  maxSize: sizeSchema.default(4 * 1024 * 1024),
});

export type MediaConfig = z.infer<typeof mediaSchema>;

export const portalSchema = z.object({
  version: z.literal(1),
  media: mediaSchema.optional(),
  content: z.array(contentTypeSchema).min(1),
});

export type PortalSchema = z.infer<typeof portalSchema>;
