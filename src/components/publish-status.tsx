"use client";

import { useEffect, useState } from "react";

type State = "idle" | "queued" | "building" | "live" | "failed";
type Status = { state: State; url?: string; detail?: string; logUrl?: string };

const LABELS: Record<State, string> = {
  idle: "Idle",
  queued: "Queued",
  building: "Publishing…",
  live: "Live",
  failed: "Failed",
};

const COLORS: Record<State, string> = {
  idle: "bg-gray-100 text-gray-600",
  queued: "bg-amber-100 text-amber-700",
  building: "bg-blue-100 text-blue-700",
  live: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

/** Polls publish status; stops once Live or Failed. */
export function PublishStatus({ siteId, commitSha }: { siteId: string; commitSha?: string }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const q = commitSha ? `?commit=${commitSha}` : "";
      try {
        const res = await fetch(`/api/sites/${siteId}/publish-status${q}`);
        const data = await res.json();
        if (!active) return;
        setStatus(data.status);
        if (data.status?.state !== "live" && data.status?.state !== "failed") {
          timer = setTimeout(poll, 5000);
        }
      } catch {
        if (active) timer = setTimeout(poll, 8000);
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [siteId, commitSha]);

  if (!status) return null;
  return (
    <div className="mt-6 flex items-center gap-3 text-sm">
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${COLORS[status.state]}`}>
        {LABELS[status.state]}
      </span>
      {status.detail && <span className="text-gray-500">{status.detail}</span>}
      {status.state === "live" && status.url && (
        <a href={status.url} target="_blank" className="text-blue-600 hover:underline">
          View live site →
        </a>
      )}
      {status.logUrl && (
        <a href={status.logUrl} target="_blank" className="text-gray-400 hover:underline">
          build log
        </a>
      )}
    </div>
  );
}
