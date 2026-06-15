import type { Field } from "@/lib/schema/types";
import type { ContentValues } from "./serialize";

/**
 * Validate editor-submitted values against a content type's fields.
 *
 * Server-side gate before any write: enforces required, basic types, numeric
 * bounds, maxLength, and select membership, recursing into list/object. Returns
 * a flat list of human-readable errors keyed by dotted field path.
 */
export type FieldError = { path: string; message: string };

export function validateValues(
  fields: Field[],
  values: ContentValues,
): FieldError[] {
  const errors: FieldError[] = [];
  validateInto(fields, values ?? {}, "", errors);
  return errors;
}

function validateInto(
  fields: Field[],
  values: Record<string, unknown>,
  prefix: string,
  errors: FieldError[],
): void {
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    const value = values?.[field.name];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "");

    if (empty) {
      if (field.required) errors.push({ path, message: `${field.label} is required` });
      continue;
    }

    switch (field.type) {
      case "string":
      case "text":
      case "rich-text":
      case "image":
      case "date":
        if (typeof value !== "string") {
          errors.push({ path, message: `${field.label} must be text` });
        } else if (field.maxLength && value.length > field.maxLength) {
          errors.push({
            path,
            message: `${field.label} exceeds ${field.maxLength} characters`,
          });
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          errors.push({ path, message: `${field.label} must be true/false` });
        }
        break;
      case "number":
        if (typeof value !== "number" || Number.isNaN(value)) {
          errors.push({ path, message: `${field.label} must be a number` });
        } else {
          if (field.min !== undefined && value < field.min) {
            errors.push({ path, message: `${field.label} must be ≥ ${field.min}` });
          }
          if (field.max !== undefined && value > field.max) {
            errors.push({ path, message: `${field.label} must be ≤ ${field.max}` });
          }
        }
        break;
      case "select": {
        const allowed = new Set((field.options ?? []).map((o) => o.value));
        const vals = field.multiple ? (value as unknown[]) : [value];
        if (field.multiple && !Array.isArray(value)) {
          errors.push({ path, message: `${field.label} must be a list` });
          break;
        }
        for (const v of vals) {
          if (!allowed.has(v as string)) {
            errors.push({ path, message: `${field.label}: "${String(v)}" is not an allowed option` });
          }
        }
        break;
      }
      case "object":
        if (typeof value !== "object" || Array.isArray(value)) {
          errors.push({ path, message: `${field.label} must be a group` });
        } else {
          validateInto(field.fields ?? [], value as Record<string, unknown>, path, errors);
        }
        break;
      case "list":
        if (!Array.isArray(value)) {
          errors.push({ path, message: `${field.label} must be a list` });
        } else {
          value.forEach((item, i) => {
            if (typeof item !== "object" || item === null) {
              errors.push({ path: `${path}[${i}]`, message: `Item must be a group` });
            } else {
              validateInto(field.fields ?? [], item as Record<string, unknown>, `${path}[${i}]`, errors);
            }
          });
        }
        break;
    }
  }
}
