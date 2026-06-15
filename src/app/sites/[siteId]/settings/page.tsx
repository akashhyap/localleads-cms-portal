"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

type Adapter = "none" | "cloudways" | "cloudflare" | "vercel";

export default function SettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const [clientEditing, setClientEditing] = useState(false);
  const [adapter, setAdapter] = useState<Adapter>("none");
  const [configText, setConfigText] = useState("{\n  \"liveUrl\": \"\"\n}");
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/sites/${siteId}`)
      .then((r) => r.json())
      .then((d) => {
        setClientEditing(d.site.clientEditingEnabled);
        setAdapter(d.site.deployAdapter);
        setLoaded(true);
      });
  }, [siteId]);

  async function save() {
    setMsg("");
    let deployConfig: Record<string, unknown> = {};
    try {
      deployConfig = JSON.parse(configText);
    } catch {
      return setMsg("Deploy config is not valid JSON");
    }
    const res = await fetch(`/api/sites/${siteId}/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientEditingEnabled: clientEditing, deployAdapter: adapter, deployConfig }),
    });
    setMsg(res.ok ? "Saved." : "Save failed");
  }

  if (!loaded) return null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/sites/${siteId}`} className="text-sm text-gray-500 hover:underline">
        ← Back to site
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Settings</h1>

      <div className="mt-8 space-y-8">
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={clientEditing} onChange={(e) => setClientEditing(e.target.checked)} />
          <span>
            <span className="font-medium">Client editing</span>
            <span className="block text-sm text-gray-500">When off, invited clients lose access entirely (your access is unaffected).</span>
          </span>
        </label>

        <div>
          <label className="block text-sm font-medium">Deploy target</label>
          <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" value={adapter} onChange={(e) => setAdapter(e.target.value as Adapter)}>
            <option value="none">None</option>
            <option value="cloudways">Cloudways</option>
            <option value="cloudflare">Cloudflare Pages</option>
            <option value="vercel">Vercel</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Deploy config (JSON)</label>
          <textarea className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm" rows={6} value={configText} onChange={(e) => setConfigText(e.target.value)} />
          <p className="mt-1 text-xs text-gray-400">e.g. liveUrl, workflowFile (Cloudways), projectId/token (Vercel), accountId/projectName/apiToken (Cloudflare).</p>
        </div>

        <button onClick={save} className="rounded-lg bg-gray-900 px-5 py-2 text-white">Save settings</button>
        {msg && <span className="ml-3 text-sm text-gray-600">{msg}</span>}
      </div>
    </main>
  );
}
