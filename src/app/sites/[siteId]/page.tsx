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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">
        ← All sites
      </Link>
      <header className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{access.site.name}</h1>
          <p className="text-sm text-gray-500">
            {access.site.repoOwner}/{access.site.repoName}
          </p>
        </div>
        {isAgency && (
          <nav className="flex gap-3 text-sm">
            <Link href={`/sites/${siteId}/invites`} className="text-gray-600 hover:underline">
              Invites
            </Link>
            <Link href={`/sites/${siteId}/audit`} className="text-gray-600 hover:underline">
              Audit log
            </Link>
            <Link href={`/sites/${siteId}/settings`} className="text-gray-600 hover:underline">
              Settings
            </Link>
          </nav>
        )}
      </header>

      <PublishStatus siteId={siteId} />

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">
          Content
        </h2>
        <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {schema.content.map((ct) => (
            <li key={ct.name}>
              <Link
                href={`/sites/${siteId}/${ct.name}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
              >
                <span>
                  <span className="font-medium">{ct.label}</span>
                  <span className="ml-2 text-xs text-gray-400">{ct.type}</span>
                </span>
                <span className="text-gray-300">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
