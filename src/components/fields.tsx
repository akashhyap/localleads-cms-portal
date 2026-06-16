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
  "mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-50 disabled:text-gray-400";

export function FieldInput({ field, value, onChange, siteId, disabled }: Props) {
  // Booleans read better with the label beside the control.
  if (field.type === "boolean") {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className={labelCls}>{field.label}</span>
          {field.help && <p className="mt-0.5 text-xs text-gray-400">{field.help}</p>}
        </div>
        <Toggle on={Boolean(value)} disabled={disabled} onChange={onChange} />
      </div>
    );
  }
  return (
    <div>
      <label className={labelCls}>
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      <Control field={field} value={value} onChange={onChange} siteId={siteId} disabled={disabled} />
      {field.help && <p className="mt-1.5 text-xs text-gray-400">{field.help}</p>}
    </div>
  );
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: unknown) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        on ? "bg-gray-900" : "bg-gray-300"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Control({ field, value, onChange, siteId, disabled }: Props) {
  switch (field.type) {
    case "text":
      return (
        <textarea
          disabled={disabled}
          className={`${inputCls} min-h-[88px] leading-relaxed`}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "rich-text":
      return (
        <div className="mt-1.5">
          <RichText editable={!disabled} value={(value as string) ?? ""} onChange={onChange} />
        </div>
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
        <div className="mt-2 space-y-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
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
        <div key={i} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {field.label} {i + 1}
            </span>
            {!disabled && (
              <button
                type="button"
                className="text-xs font-medium text-red-500 hover:text-red-600"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
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
        <button
          type="button"
          className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:border-gray-400 hover:bg-gray-50"
          onClick={() => onChange([...items, {}])}
        >
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
    <div className="mt-1.5">
      {value ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-24 w-24 rounded-lg border border-gray-200 bg-gray-50 object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-gray-500">{value}</p>
            {!disabled && (
              <div className="mt-2 flex gap-2">
                <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">
                  {uploading ? "Uploading…" : "Replace"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                </label>
                <button type="button" onClick={() => onChange("")} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        !disabled && (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center transition hover:border-gray-400 hover:bg-gray-50">
            <span className="text-sm font-medium text-gray-700">{uploading ? "Uploading…" : "Upload image"}</span>
            <span className="mt-1 text-xs text-gray-400">JPG, PNG, WEBP, SVG or AVIF</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        )
      )}
      {/* Advanced: paste/edit the path directly. */}
      {!disabled && (
        <input
          className={`${inputCls} mt-2 text-xs`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/uploads/…"
        />
      )}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
