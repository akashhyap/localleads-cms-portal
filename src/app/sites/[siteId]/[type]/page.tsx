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

  if (loading) return <Shell siteId={siteId}>Loading…</Shell>;
  if (error) return <Shell siteId={siteId}><p className="text-red-600">{error}</p></Shell>;
  if (!def || !perms) return null;

  if (kind === "singleton") {
    return (
      <Shell siteId={siteId}>
        <h1 className="text-2xl font-semibold">{def.label}</h1>
        <PublishStatus siteId={siteId} />
        <SingletonEditor siteId={siteId} type={type} def={def} canEdit={perms.edit} />
      </Shell>
    );
  }

  return (
    <Shell siteId={siteId}>
      <CollectionView
        siteId={siteId}
        type={type}
        def={def}
        perms={perms}
        entries={entries}
        reload={load}
      />
    </Shell>
  );
}

function Shell({ siteId, children }: { siteId: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/sites/${siteId}`} className="text-sm text-gray-500 hover:underline">
        ← Back to site
      </Link>
      <div className="mt-4">{children}</div>
    </main>
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
      setMsg("This file changed in GitHub since you opened it. Reload to get the latest, then re-apply your edit.");
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
    <div className="mt-6 space-y-6">
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
      {canEdit && (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className="rounded-lg bg-gray-900 px-5 py-2 text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
        </div>
      )}
    </div>
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{def.label}</h1>
        {perms.create && (
          <button onClick={() => setEditing("new")} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
            + New
          </button>
        )}
      </div>
      <ul className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {entries.length === 0 && <li className="px-5 py-4 text-sm text-gray-400">No items yet.</li>}
        {entries.map((e) => (
          <li key={e.path}>
            <button onClick={() => setEditing(e)} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50">
              <span>{e.title}</span>
              <span className="text-gray-300">→</span>
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
    <div className="space-y-6">
      <button onClick={onDone} className="text-sm text-gray-500 hover:underline">
        ← Back to {def.label}
      </button>
      <h1 className="text-2xl font-semibold">{isNew ? `New ${def.label}` : def.label}</h1>
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
      <div className="flex items-center gap-3">
        {canEdit && (
          <button onClick={save} disabled={saving} className="rounded-lg bg-gray-900 px-5 py-2 text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        {!isNew && perms.delete && (
          <button onClick={remove} className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600">
            Delete
          </button>
        )}
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>
    </div>
  );
}
