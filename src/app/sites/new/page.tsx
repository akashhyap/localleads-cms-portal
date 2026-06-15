"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Repo = { id: number; owner: string; name: string; fullName: string; defaultBranch: string };

export default function NewSitePage() {
  const router = useRouter();
  const [installationId, setInstallationId] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selected, setSelected] = useState<Repo | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadRepos() {
    setError("");
    setBusy(true);
    const res = await fetch(`/api/github/repos?installationId=${installationId}`);
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error || "Failed to list repos");
    setRepos(data.repos);
  }

  async function register() {
    if (!selected) return;
    setError("");
    setDetails([]);
    setBusy(true);
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name || selected.name,
        installationId: Number(installationId),
        repoOwner: selected.owner,
        repoName: selected.name,
        contentBranch: selected.defaultBranch,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.status === 422) {
      setError(data.error || "Schema invalid");
      setDetails(data.details ?? []);
      return;
    }
    if (!res.ok) return setError(data.error || "Failed to register");
    router.push(`/sites/${data.siteId}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Add a site</h1>
      <p className="mt-2 text-sm text-gray-500">
        Pick a repo the GitHub App is installed on. Its <code>portal.yml</code> is validated before registering.
      </p>

      <div className="mt-8 space-y-6">
        <div>
          <label className="block text-sm font-medium">GitHub App installation ID</label>
          <div className="mt-1 flex gap-2">
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={installationId} onChange={(e) => setInstallationId(e.target.value)} placeholder="e.g. 12345678" />
            <button onClick={loadRepos} disabled={!installationId || busy} className="whitespace-nowrap rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">
              List repos
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">Found in the App installation URL or Settings → Installations.</p>
        </div>

        {repos.length > 0 && (
          <div>
            <label className="block text-sm font-medium">Repository</label>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={selected?.id ?? ""}
              onChange={(e) => setSelected(repos.find((r) => r.id === Number(e.target.value)) ?? null)}
            >
              <option value="">Select a repo…</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </div>
        )}

        {selected && (
          <div>
            <label className="block text-sm font-medium">Display name</label>
            <input className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder={selected.name} />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>{error}</p>
            {details.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {selected && (
          <button onClick={register} disabled={busy} className="rounded-lg bg-gray-900 px-5 py-2 text-white disabled:opacity-50">
            {busy ? "Validating…" : "Register site"}
          </button>
        )}
      </div>
    </main>
  );
}
