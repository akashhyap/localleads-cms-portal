# `portal.yml` — site content schema specification

`portal.yml` lives at the **root of each site repo** and declares everything the
Portal is allowed to edit. It is the source of truth for *what is editable*; the
Portal database never holds this — it reads the file fresh from GitHub and
caches it only as a hint.

This file is baked into our Astro starter template so every new site is
portal-ready at birth. The Portal **onboards new projects only** — there is no
retrofitting of old sites.

A complete, runnable example lives at [`docs/examples/portal.yml`](./examples/portal.yml).

---

## Top level

```yaml
version: 1          # required; schema format version
media: { ... }      # optional; upload settings
content: [ ... ]    # required; one or more content types
```

## `media`

| Key          | Type     | Default                                   | Notes |
|--------------|----------|-------------------------------------------|-------|
| `input`      | string   | —                                         | Repo directory uploads are committed into. |
| `output`     | string   | —                                         | Public path content references resolve to (Astro-served). |
| `extensions` | string[] | `[jpg, jpeg, png, webp, svg, avif]`       | Allowed upload extensions. |
| `maxSize`    | size     | `4MB`                                     | Accepts `4MB`, `500kb`, or a raw byte count. Enforced before commit. |

> The 4MB default is deliberate: images are committed through the GitHub
> Contents API as base64 and serverless request bodies are capped (~4.5MB on
> Vercel). Keep hero images at or below this; the uploader validates it.

## `content[]`

Every content type is either a **singleton** (one file) or a **collection** (a
directory of files).

### Common keys

| Key           | Type    | Required | Notes |
|---------------|---------|----------|-------|
| `name`        | slug    | yes      | Stable key (`[a-z0-9_-]+`). Used in URLs/APIs — don't change it casually. |
| `label`       | string  | yes      | Human label shown to editors. |
| `description` | string  | no       | Help text for the whole type. |
| `type`        | enum    | yes      | `singleton` \| `collection`. |
| `path`        | string  | yes      | Singleton: the file. Collection: the directory. |
| `format`      | enum    | yes      | `md` \| `mdx` \| `json` \| `yaml`. Maps onto Astro content collections. |
| `fields`      | Field[] | yes      | At least one field. |
| `operations`  | object  | no       | Allow/deny `create`/`edit`/`delete`/`rename`. See below. |

### Collection-only keys

| Key          | Type   | Default            | Notes |
|--------------|--------|--------------------|-------|
| `filename`   | string | `{slug}.{format}`  | Pattern for new item filenames. `{slug}` resolved from the item. |
| `titleField` | string | —                  | Field used as the row label in lists. Must be a declared field. |

### `operations`

Declares the **ceiling** of what's possible for the type. By kind:

- **singleton** default: `{ create: false, edit: true, delete: false, rename: false }`
- **collection** default: `{ create: true, edit: true, delete: true, rename: true }`

Explicit values override the defaults. The effective permission for a given
user is `schema ceiling ∩ role defaults ∩ per-member override` — see
[`docs/permissions.md`](./permissions.md). A schema can only *restrict*; it can
never grant an operation a role doesn't have.

## Fields

| Key        | Applies to        | Notes |
|------------|-------------------|-------|
| `name`     | all               | Frontmatter/JSON key (`[a-zA-Z0-9_]+`). |
| `label`    | all               | Editor label. |
| `type`     | all               | One of the field types below. |
| `help`     | all               | Helper text under the input. |
| `required` | all               | Validated on save. |
| `default`  | all               | Pre-fills new items. |
| `options`  | `select`          | List of `value` or `{ label, value }`. Required for selects. |
| `multiple` | `select`          | Allow multiple selections. |
| `min`/`max`/`step` | `number`  | Numeric constraints. |
| `maxLength`| `string`/`text`   | Character limit. |
| `fields`   | `list`/`object`   | Nested fields. Required for these types. |

### Field types

| Type        | Renders as                  | Stored as |
|-------------|-----------------------------|-----------|
| `string`    | single-line input           | string |
| `text`      | multi-line textarea         | string |
| `rich-text` | TipTap WYSIWYG editor       | Markdown (md/mdx) or HTML string (json/yaml) |
| `image`     | media picker/uploader       | path string (relative to `media.output`) |
| `boolean`   | toggle                      | boolean |
| `select`    | dropdown                    | string (or string[] if `multiple`) |
| `number`    | number input                | number |
| `date`      | date picker                 | ISO date string |
| `list`      | repeater of sub-fields      | array of objects |
| `object`    | fixed group of sub-fields   | object |

## How it maps onto files

- **`md` / `mdx`** — scalar fields become YAML frontmatter; the field named
  `body` (a `rich-text`) becomes the Markdown body below the frontmatter.
- **`json` / `yaml`** — the whole field tree serialises to a structured data
  file (clean fit for Astro data collections).

## Validation

The Portal validates `portal.yml` on **Add Site** and refuses to register a repo
with an invalid schema, reporting each error. Validation is also re-run whenever
the schema is refreshed from the repo. See `src/lib/schema/parse.ts`.
