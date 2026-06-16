"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { FieldInput, type UIField } from "@/components/fields";
import { PublishStatus } from "@/components/publish-status";

type Permissions = { create: boolean; edit: boolean; delete: boolean; rename: boolean };
type TypeDef = { name: string; label: string; type: "singleton" | "collection"; fields: UIField[]; titleField?: string };
type CollectionEntry = { path: string; title: string; sha: string };

export default function ContentTypePage({
  params,
}: {
  params: Promise<{ siteId: string; type: string }>;
}) {
  const { siteId, type } = use(params);
  const [def, setDef] = useState<TypeDef | null>(null);
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [kind, setKind] = useState<"singleton" | "collection" | null>(null);
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/sites/${siteId}/content/${type}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to load");
      return;
    }
    setDef(data.type);
    setPerms(data.permissions);
    setKind(data.kind);
    if (data.kind === "collection") setEntries(data.entries);
  }, [siteId, type]);

  useEffect(() => {
    // Async loader; state is set after the fetch resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) return <Shell siteId={siteId}><LoadingCard /></Shell>;
  if (error)
    return (
      <Shell siteId={siteId}>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </Shell>
    );
  if (!def || !perms) return null;

  if (kind === "singleton") {
    return (
      <Shell siteId={siteId}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{def.label}</h1>
          <PublishStatus siteId={siteId} />
        </div>
        <SingletonEditor siteId={siteId} type={type} def={def} canEdit={perms.edit} />
      </Shell>
    );
  }

  return (
    <Shell siteId={siteId}>
      <CollectionView siteId={siteId} type={type} def={def} perms={perms} entries={entries} reload={load} />
    </Shell>
  );
}

function Shell({ siteId, children }: { siteId: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/sites/${siteId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-900">
        ← Back to site
      </Link>
      <div className="mt-5">{children}</div>
    </main>
  );
}

function LoadingCard() {
  return (
    <div className="animate-pulse space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
      <div className="h-5 w-40 rounded bg-gray-200" />
      <div className="h-10 rounded bg-gray-100" />
      <div className="h-10 w-2/3 rounded bg-gray-100" />
      <div className="h-24 rounded bg-gray-100" />
    </div>
  );
}

function FieldsCard({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">{children}</div>;
}

/** Floating action bar that stays in view while editing long forms. */
function SaveBar({ onSave, saving, msg, children }: { onSave?: () => void; saving: boolean; msg: string; children?: React.ReactNode }) {
  const ok = /saved|publish|guardad/i.test(msg);
  return (
    <div className="sticky bottom-4 mt-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      {onSave && (
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      )}
      {children}
      {msg && <span className={`text-sm ${ok ? "text-green-600" : "text-amber-600"}`}>{msg}</span>}
    </div>
  );
}

function emptyValues(fields: UIField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f.name, f.type === "boolean" ? false : f.type === "list" ? [] : ""]));
}

function SingletonEditor({ siteId, type, def, canEdit }: { siteId: string; type: string; def: TypeDef; canEdit: boolean }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [sha, setSha] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/sites/${siteId}/content/${type}`)
      .then((r) => r.json())
      .then((d) => {
        setValues({ ...emptyValues(def.fields), ...d.values });
        setSha(d.sha);
      });
  }, [siteId, type, def.fields]);

  async function save() {
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/sites/${siteId}/content/${type}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values, baseSha: sha }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.status === 409) {
      setMsg("Changed in GitHub since you opened it — reload, then re-apply your edit.");
      return;
    }
    if (!res.ok) {
      setMsg(data.error || "Save failed");
      return;
    }
    setSha(data.sha);
    setMsg("Saved — publishing…");
  }

  return (
    <>
      <FieldsCard>
        {def.fields.map((f) => (
          <FieldInput
            key={f.name}
            field={f}
            siteId={siteId}
            disabled={!canEdit}
            value={values[f.name]}
            onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
          />
        ))}
      </FieldsCard>
      {canEdit && <SaveBar onSave={save} saving={saving} msg={msg} />}
    </>
  );
}

function CollectionView({
  siteId,
  type,
  def,
  perms,
  entries,
  reload,
}: {
  siteId: string;
  type: string;
  def: TypeDef;
  perms: Permissions;
  entries: CollectionEntry[];
  reload: () => void;
}) {
  const [editing, setEditing] = useState<CollectionEntry | "new" | null>(null);
  const [q, setQ] = useState("");

  if (editing) {
    return (
      <ItemEditor
        siteId={siteId}
        type={type}
        def={def}
        perms={perms}
        entry={editing === "new" ? null : editing}
        onDone={() => {
          setEditing(null);
          reload();
        }}
      />
    );
  }

  const filtered = entries.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{def.label}</h1>
          <p className="text-sm text-gray-500">
            {entries.length} {entries.length === 1 ? "item" : "items"}
          </p>
        </div>
        {perms.create && (
          <button
            onClick={() => setEditing("new")}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            + New
          </button>
        )}
      </div>

      {entries.length > 4 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="mt-5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
        />
      )}

      <ul className="mt-5 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {filtered.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-gray-400">
            {entries.length === 0 ? "No items yet." : "No matches."}
          </li>
        )}
        {filtered.map((e) => (
          <li key={e.path}>
            <button
              onClick={() => setEditing(e)}
              className="group flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-gray-50"
            >
              <span className="font-medium text-gray-800">{e.title}</span>
              <span className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500">→</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemEditor({
  siteId,
  type,
  def,
  perms,
  entry,
  onDone,
}: {
  siteId: string;
  type: string;
  def: TypeDef;
  perms: Permissions;
  entry: CollectionEntry | null;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(emptyValues(def.fields));
  const [sha, setSha] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const isNew = !entry;

  useEffect(() => {
    if (!entry) return;
    fetch(`/api/sites/${siteId}/content/${type}/item?path=${encodeURIComponent(entry.path)}`)
      .then((r) => r.json())
      .then((d) => {
        setValues({ ...emptyValues(def.fields), ...d.values });
        setSha(d.sha);
      });
  }, [entry, siteId, type, def.fields]);

  async function save() {
    setSaving(true);
    setMsg("");
    const url = isNew ? `/api/sites/${siteId}/content/${type}` : `/api/sites/${siteId}/content/${type}/item`;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(isNew ? { values } : { path: entry!.path, values, baseSha: sha }),
    });
    setSaving(false);
    if (res.status === 409) return setMsg("This item changed in GitHub. Reload and try again.");
    if (!res.ok) {
      const d = await res.json();
      return setMsg(d.error || "Save failed");
    }
    onDone();
  }

  async function remove() {
    if (!entry || !confirm("Delete this item?")) return;
    const res = await fetch(`/api/sites/${siteId}/content/${type}/item`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: entry.path, baseSha: sha }),
    });
    if (res.ok) onDone();
    else setMsg("Delete failed");
  }

  const canEdit = isNew ? perms.create : perms.edit;

  return (
    <div>
      <button onClick={onDone} className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-900">
        ← Back to {def.label}
      </button>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{isNew ? `New ${def.label}` : def.label}</h1>

      <FieldsCard>
        {def.fields.map((f) => (
          <FieldInput
            key={f.name}
            field={f}
            siteId={siteId}
            disabled={!canEdit}
            value={values[f.name]}
            onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
          />
        ))}
      </FieldsCard>

      {(canEdit || (!isNew && perms.delete)) && (
        <SaveBar onSave={canEdit ? save : undefined} saving={saving} msg={msg}>
          {!isNew && perms.delete && (
            <button
              onClick={remove}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </SaveBar>
      )}
    </div>
  );
}
