"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

type Invite = { id: string; email: string; role: string; status: string; expiresAt: string };

export default function InvitesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [acceptUrl, setAcceptUrl] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/sites/${siteId}/invites`);
    if (res.ok) setInvites((await res.json()).invites);
  }, [siteId]);

  useEffect(() => {
    // Async loader; state is set after the fetch resolves, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setAcceptUrl("");
    const res = await fetch(`/api/sites/${siteId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "Failed");
    setAcceptUrl(data.acceptUrl);
    setMsg(data.emailSent ? "Invite emailed." : "Invite created — share the link below.");
    setEmail("");
    load();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/sites/${siteId}`} className="text-sm text-gray-500 hover:underline">
        ← Back to site
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Invites</h1>

      <form onSubmit={invite} className="mt-6 flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        <button className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Invite</button>
      </form>
      {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
      {acceptUrl && (
        <p className="mt-1 break-all rounded-lg bg-gray-50 p-2 text-xs text-gray-600">{acceptUrl}</p>
      )}

      <ul className="mt-8 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {invites.length === 0 && <li className="px-5 py-4 text-sm text-gray-400">No invites yet.</li>}
        {invites.map((i) => (
          <li key={i.id} className="flex items-center justify-between px-5 py-3 text-sm">
            <span>{i.email}</span>
            <span className="text-xs text-gray-400">{i.status}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-gray-400">
        Note: clients only see this site after you turn on client editing in Settings.
      </p>
    </main>
  );
}
