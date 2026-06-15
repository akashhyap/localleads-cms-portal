# Portal

An internal, multi-site content management portal for our agency's Astro
client sites. Our team (and, when upgraded, clients) edit content, images, and
logos through a web UI — no code, no Git credentials. Built from scratch,
architecturally inspired by [Pages CMS](https://pagescms.org).

> Client-facing label: **"Client Portal"**. Internal/working name: **portal**.

## The one rule that shapes everything

**Content and media live ONLY in each site's Git repository — never in this
database.** The repo is the single source of truth. This database stores only
accounts, the org→sites→members graph, invites, deploy config, the commit job
queue, and an append-only audit log. If this portal vanished, every website and
all its content would remain intact in GitHub.

## How it works

```
Editor (browser)
  → Next.js API route  (authz in the policy layer, server-side)
    → Content service   (schema + permissions + validation)
      → Write pipeline   (commit_jobs + per-file advisory lock + optimistic concurrency)
        → GitHub App      (installation token; the ONLY thing that writes to repos)
          → commit on `main`
            → GitHub Action builds + publishes to `deploy` branch
              → Cloudways pulls `deploy`  → Live
```

- **Three adapter boundaries** so the unstable bits never force a rewrite: the
  Git provider (`src/lib/git`), deploy targets (`src/lib/deploy`), and auth/email
  (Supabase).
- **Each site repo carries a `portal.yml`** declaring what's editable. See
  [`docs/portal-schema.md`](docs/portal-schema.md) and the worked example at
  [`docs/examples/portal.yml`](docs/examples/portal.yml).
- **Optimistic concurrency**: every save sends the blob SHA the editor loaded;
  a mismatch surfaces a clean "this changed, reload" conflict instead of
  clobbering. Writes to the same file are serialised with a Postgres advisory
  lock.
- **Strict isolation**: clients see only the sites they were invited to, and
  only while that site's client-editing toggle is ON. Turning it off revokes
  access with no other side effects.

## Tech stack

| Concern        | Choice |
|----------------|--------|
| Framework      | Next.js (App Router) + TypeScript, deploy on Vercel |
| Database       | Supabase Postgres via Drizzle ORM |
| Auth           | Supabase Auth (magic link) |
| Repo I/O       | GitHub App + Octokit (installation tokens, server-side only) |
| Rich text      | TipTap (+ tiptap-markdown for Markdown round-trip) |
| Background     | Inngest (write retries + deploy-status polling) — serverless-friendly |
| Tests          | Vitest |

## Project structure

```
src/
  app/                 # routes (UI pages + /api route handlers)
  components/          # editor, fields, rich-text, publish-status
  lib/
    db/                # Drizzle schema + client
    permissions/       # pure permission resolver (schema ∩ role ∩ override)
    schema/            # portal.yml parser/validator
    git/               # Git provider boundary + GitHub App impl + path safety
    content/           # serialization, validation, orchestration service
    pipeline/          # the write pipeline (commit_jobs, concurrency, audit)
    deploy/            # deploy-target adapters
    auth/              # session + access/isolation policy layer
    media/, invites/, sites/, audit/, api/
docs/                  # schema spec, examples, reference GitHub Action
drizzle/               # generated migrations
scripts/seed.ts        # create the org + first owner
```

## Local development

### 1. Prerequisites
- Node 20+ and pnpm
- A Supabase project (free tier is fine)
- A GitHub App (see below)

### 2. Install & configure
```bash
pnpm install
cp .env.example .env.local   # then fill in the values
```

### 3. Supabase
1. Create a project at supabase.com.
2. Copy the project URL, anon key, and service role key into `.env.local`.
3. Copy the **Transaction pooler** connection string (port 6543) into
   `DATABASE_URL`.
4. Enable **Email** auth (magic links) under Authentication → Providers. For
   real invite emails, configure SMTP under Authentication → Emails.
5. Apply the schema:
   ```bash
   pnpm db:migrate     # applies drizzle/ migrations (incl. append-only audit log)
   ```

### 4. GitHub App
1. GitHub → Settings → Developer settings → **GitHub Apps** → New GitHub App.
2. Permissions → Repository: **Contents: Read & write**, **Metadata: Read**,
   **Actions: Read** (for Cloudways publish status).
3. Where can it be installed: **Only on this account**.
4. Generate a **private key** (.pem) and note the **App ID** and **Client ID**.
5. Put them in `.env.local`. For `GITHUB_APP_PRIVATE_KEY` you can either paste
   the PEM with literal `\n` escapes or base64-encode the file
   (`base64 -w0 key.pem`) — the loader handles both.
6. **Install the App** on the repos you want to manage. The installation ID is
   in the install URL (`/settings/installations/<id>`); you'll paste it in the
   Add Site flow.

### 5. Run
```bash
pnpm dev
```

### 6. Create the first owner
1. Visit `http://localhost:3000/login` and sign in once with your email
   (creates your auth user + profile).
2. Promote yourself to org owner:
   ```bash
   pnpm tsx scripts/seed.ts "My Agency" you@agency.com
   ```
3. Reload `/dashboard` — you can now **Add site**.

## Registering a site & going live (the Phase 1 happy path)

1. Ensure the site repo has a valid `portal.yml` (copy from
   `docs/examples/portal.yml`) and the deploy workflow from
   `docs/examples/github-actions/deploy.yml` at `.github/workflows/deploy.yml`.
2. In the repo, set the Cloudways secrets (see the workflow header) and point
   Cloudways to pull the **`deploy`** branch.
3. Portal → **Add site** → paste the installation ID → pick the repo. Portal
   validates `portal.yml` and registers it.
4. **Settings** → choose deploy target **Cloudways**, set
   `{ "liveUrl": "https://the-site.com" }`, and toggle client editing if you
   want to grant a client access.
5. Edit the homepage headline / swap the hero image → **Save**. Watch the badge
   go Saving → Publishing → Live.
6. **Invites** → invite a client email. They get a magic link, can edit only
   this site, and (per the default permissions) cannot delete pages.
7. **Audit log** → review the whole session.

## Deploy to Vercel
1. Import the repo in Vercel.
2. Add every variable from `.env.example` as a Project Environment Variable.
3. Set `APP_URL` to your Vercel URL and add it to Supabase Auth → URL
   Configuration → Redirect URLs (`<APP_URL>/auth/callback`).
4. Deploy. Hobby tier is fine for development; switch to Pro before real
   clients log in.

The app is a standard containerizable Next.js app, so it can move to a VPS with
Docker if we ever leave Vercel.

## Testing
```bash
pnpm test        # vitest: permissions, schema, paths, content, pipeline, isolation
pnpm typecheck
pnpm lint
```
Critical paths covered by tests: the permission resolver, the isolation rules,
the write pipeline (optimistic concurrency + conflict handling), path-traversal
safety, the schema parser, and content serialization.

## Roadmap (not in Phase 1)
Billing/self-signup, multi-agency tenancy UI, white-labeling, GitLab support,
scheduled publishing, and the read-only "viewer" role with a "Request a change"
button (the upsell surface — the data model already reserves it).
