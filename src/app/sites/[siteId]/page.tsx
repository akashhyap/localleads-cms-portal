import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getSiteAccess } from "@/lib/auth/access";
import { getAuthUser } from "@/lib/auth/session";
import { loadSchema } from "@/lib/content/service";
import { PublishStatus } from "@/components/publish-status";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const access = await getSiteAccess(user.id, siteId);
  if (!access) notFound();

  const schema = await loadSchema(access.site);
  const isAgency = access.actor.kind === "agency";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto w-full max-w-4xl px-6 py-4">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-500 transition hover:text-gray-900">
            ← All sites
          </Link>
          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{access.site.name}</h1>
              <p className="truncate text-sm text-gray-500">
                {access.site.repoOwner}/{access.site.repoName}
              </p>
            </div>
            {isAgency && (
              <nav className="flex shrink-0 gap-1 text-sm">
                {[
                  { href: `/sites/${siteId}/invites`, label: "Invites" },
                  { href: `/sites/${siteId}/audit`, label: "Audit log" },
                  { href: `/sites/${siteId}/settings`, label: "Settings" },
                ].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="rounded-lg px-3 py-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <PublishStatus siteId={siteId} />

        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Content</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {schema.content.map((ct) => (
              <li key={ct.name}>
                <Link
                  href={`/sites/${siteId}/${ct.name}`}
                  className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-900 hover:shadow-md"
                >
                  <span>
                    <span className="block font-medium text-gray-900">{ct.label}</span>
                    <span className="mt-0.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      {ct.type}
                    </span>
                  </span>
                  <span className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
