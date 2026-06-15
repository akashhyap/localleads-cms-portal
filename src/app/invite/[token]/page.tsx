"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Invite landing page. If the visitor isn't signed in, sends them a magic link
 * (the link returns here). Once authenticated, redeems the invite.
 */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [state, setState] = useState<"checking" | "need-auth" | "accepting" | "error">("checking");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setState("need-auth");
        return;
      }
      setState("accepting");
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (res.ok) {
        router.push(`/sites/${body.siteId}`);
      } else {
        setState("error");
        setMessage(
          body.error === "email-mismatch"
            ? "This invite was sent to a different email address."
            : body.error === "expired"
              ? "This invite has expired. Ask for a new one."
              : "This invite is no longer valid.",
        );
      }
    })();
  }, [token, router]);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/invite/${token}` },
    });
    setMessage(`Check ${email} for your sign-in link.`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">You have been invited</h1>
      {state === "checking" && <p className="mt-3 text-gray-500">Checking your invite…</p>}
      {state === "accepting" && <p className="mt-3 text-gray-500">Setting up your access…</p>}
      {state === "error" && <p className="mt-3 text-red-600">{message}</p>}
      {state === "need-auth" && (
        <form onSubmit={sendLink} className="mt-6 space-y-4">
          <p className="text-sm text-gray-500">Enter the email this invite was sent to.</p>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-lg border border-gray-300 px-4 py-2" />
          <button className="w-full rounded-lg bg-gray-900 px-4 py-2 text-white">Send sign-in link</button>
          {message && <p className="text-sm text-gray-600">{message}</p>}
        </form>
      )}
    </main>
  );
}
