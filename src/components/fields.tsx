"use client";

import { useState } from "react";

import { RichText } from "./rich-text";

/** Minimal field shape mirrored from the schema (client-safe subset). */
export type UIField = {
  name: string;
  label: string;
  type: string;
  help?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  multiple?: boolean;
  min?: number;
  max?: number;
  step?: number;
  fields?: UIField[];
};

type Props = {
  field: UIField;
  value: unknown;
  onChange: (value: unknown) => void;
  siteId: string;
  disabled?: boolean;
};

const labelCls = "block text-sm font-medium text-gray-800";
const inputCls =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-gray-900 disabled:bg-gray-50 disabled:text-gray-400";

export function FieldInput({ field, value, onChange, siteId, disabled }: Props) {
  return (
    <div>
      <label className={labelCls}>
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      <Control field={field} value={value} onChange={onChange} siteId={siteId} disabled={disabled} />
      {field.help && <p className="mt-1 text-xs text-gray-400">{field.help}</p>}
    </div>
  );
}

function Control({ field, value, onChange, siteId, disabled }: Props) {
  switch (field.type) {
    case "text":
      return (
        <textarea
          disabled={disabled}
          className={`${inputCls} min-h-[80px]`}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "rich-text":
      return (
        <RichText editable={!disabled} value={(value as string) ?? ""} onChange={onChange} />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          disabled={disabled}
          className="mt-2 h-5 w-5"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          disabled={disabled}
          className={inputCls}
          min={field.min}
          max={field.max}
          step={field.step}
          value={value === undefined || value === null ? "" : (value as number)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "date":
      return (
        <input
          type="date"
          disabled={disabled}
          className={inputCls}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "select":
      return (
        <select
          disabled={disabled}
          className={inputCls}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "image":
      return <ImageField siteId={siteId} value={(value as string) ?? ""} onChange={onChange} disabled={disabled} />;
    case "object":
      return (
        <div className="mt-2 space-y-4 rounded-lg border border-gray-200 p-4">
          {field.fields?.map((sub) => (
            <FieldInput
              key={sub.name}
              field={sub}
              siteId={siteId}
              disabled={disabled}
              value={(value as Record<string, unknown>)?.[sub.name]}
              onChange={(v) => onChange({ ...(value as object), [sub.name]: v })}
            />
          ))}
        </div>
      );
    case "list":
      return <ListField field={field} value={(value as unknown[]) ?? []} onChange={onChange} siteId={siteId} disabled={disabled} />;
    default:
      return (
        <input
          type="text"
          disabled={disabled}
          className={inputCls}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function ListField({ field, value, onChange, siteId, disabled }: { field: UIField; value: unknown[]; onChange: (v: unknown) => void; siteId: string; disabled?: boolean }) {
  const items = Array.isArray(value) ? value : [];
  return (
    <div className="mt-2 space-y-3">
      {items.map((item, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-gray-200 p-4">
          <div className="flex justify-between">
            <span className="text-xs text-gray-400">Item {i + 1}</span>
            {!disabled && (
              <button type="button" className="text-xs text-red-500" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                Remove
              </button>
            )}
          </div>
          {field.fields?.map((sub) => (
            <FieldInput
              key={sub.name}
              field={sub}
              siteId={siteId}
              disabled={disabled}
              value={(item as Record<string, unknown>)?.[sub.name]}
              onChange={(v) => {
                const next = [...items];
                next[i] = { ...(item as object), [sub.name]: v };
                onChange(next);
              }}
            />
          ))}
        </div>
      ))}
      {!disabled && (
        <button type="button" className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600" onClick={() => onChange([...items, {}])}>
          + Add {field.label}
        </button>
      )}
    </div>
  );
}

function ImageField({ siteId, value, onChange, disabled }: { siteId: string; value: string; onChange: (v: unknown) => void; disabled?: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setErr("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/sites/${siteId}/media`, { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setErr(data.error || "Upload failed");
      return;
    }
    onChange(data.url);
  }

  return (
    <div className="mt-1">
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="mb-2 h-32 rounded-lg border border-gray-200 object-cover" />
      )}
      <div className="flex items-center gap-2">
        <input className={inputCls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder="/uploads/..." />
        {!disabled && (
          <label className="cursor-pointer whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {uploading ? "Uploading…" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
