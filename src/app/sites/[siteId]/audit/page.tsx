"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

type Entry = {
  id: string;
  action: string;
  actorEmail: string | null;
  filePath: string | null;
  summary: string | null;
  commitSha: string | null;
  createdAt: string;
};

export default function AuditPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    fetch(`/api/sites/${siteId}/audit`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []));
  }, [siteId]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/sites/${siteId}`} className="text-sm text-gray-500 hover:underline">
        ← Back to site
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Audit log</h1>
      <ul className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {entries.length === 0 && <li className="px-5 py-4 text-sm text-gray-400">No activity yet.</li>}
        {entries.map((e) => (
          <li key={e.id} className="px-5 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{e.action}</span>
              <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-gray-600">
              {e.summary || e.filePath}
              {e.actorEmail && <span className="text-gray-400"> · {e.actorEmail}</span>}
              {e.commitSha && <span className="ml-2 font-mono text-xs text-gray-400">{e.commitSha.slice(0, 7)}</span>}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
