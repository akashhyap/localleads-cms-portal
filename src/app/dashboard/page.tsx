import Link from "next/link";
import { redirect } from "next/navigation";

import { isAgency, listSitesForUser } from "@/lib/auth/access";
import { getAuthUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const [sites, agency] = await Promise.all([
    listSitesForUser(user.id),
    isAgency(user.id),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sites</h1>
          <p className="text-sm text-gray-500">
            Signed in as {user.email}
            {agency ? " · staff" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {agency && (
            <Link
              href="/sites/new"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
            >
              Add site
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>

      {sites.length === 0 ? (
        <p className="mt-10 text-gray-500">
          {agency
            ? "No sites yet. Click “Add site” to register a repo."
            : "You don't have access to any sites yet."}
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {sites.map((site) => (
            <li key={site.id}>
              <Link
                href={`/sites/${site.id}`}
                className="block rounded-xl border border-gray-200 p-5 transition hover:border-gray-900"
              >
                <h2 className="font-medium">{site.name}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {site.repoOwner}/{site.repoName}
                </p>
                {agency && (
                  <p className="mt-3 text-xs text-gray-400">
                    Client editing: {site.clientEditingEnabled ? "ON" : "OFF"} ·
                    Deploy: {site.deployAdapter}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
