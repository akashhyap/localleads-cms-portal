import Link from "next/link";
import { redirect } from "next/navigation";

import { isAgency, listSitesForUser } from "@/lib/auth/access";
import { getAuthUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sites",
};

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const [sites, agency] = await Promise.all([
    listSitesForUser(user.id),
    isAgency(user.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">
              LocalLeads CMS Portal
            </h1>
            <p className="truncate text-sm text-gray-500">
              {user.email}
              {agency ? " · staff" : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {agency && (
              <Link
                href="/sites/new"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
              >
                Add site
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Sites</h2>

        {sites.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
            <p className="text-sm text-gray-600">
              {agency
                ? "No sites yet."
                : "You don't have access to any sites yet."}
            </p>
            {agency && (
              <Link
                href="/sites/new"
                className="mt-4 inline-block rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
              >
                Add your first site
              </Link>
            )}
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {sites.map((site) => (
              <li key={site.id}>
                <Link
                  href={`/sites/${site.id}`}
                  className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-900 hover:shadow-md"
                >
                  <h3 className="font-medium">{site.name}</h3>
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
    </div>
  );
}
