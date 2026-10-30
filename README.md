# locale-keysmith

Sort, audit, clean, and translate i18n locale files from the command line.

## Install

```bash
pnpm add -D locale-keysmith
```

Requires Node.js 22.12 or newer.

## Quick start

```bash
# See which locale files are detected
pnpm exec locale-keysmith scan

# Get a full report: missing keys, unused keys, and unsorted files
pnpm exec locale-keysmith health
```

By default everything is scanned under the `src` folder. To look elsewhere, add a config
file (see [Configuration](#configuration)).

## Commands

Run a command with `pnpm exec locale-keysmith <command>` (or `npx locale-keysmith <command>`).

| Command                    | What it does                                                                    |
| -------------------------- | ------------------------------------------------------------------------------- |
| `scan`                     | List the locale files that were found, with their inferred locale.              |
| `health`                   | Report missing keys, unused keys, and unsorted files. Exits non-zero on issues. |
| `missing`                  | List keys present in the source locale but missing from the others.             |
| `unused`                   | List source-locale keys that no source file references.                         |
| `sort`                     | Sort every locale file's keys alphabetically (nested too).                      |
| `remove-unused`            | Delete unused keys from every locale file.                                      |
| `translate --to <locales>` | Fill missing keys in target locales via Google Translate.                       |

### `scan`

```bash
pnpm exec locale-keysmith scan
```

Prints one line per detected locale file, e.g. `en  src/locales/en.json`.

### `health`

```bash
pnpm exec locale-keysmith health
```

A one-shot audit that combines the checks below. It prints each problem it finds:

```
unsorted src/locales/de.json
missing de status.offline
unused legacy.oldButton

3 issues found.
```

It exits with a non-zero status when any issue is found, so it can gate CI. When everything
is fine it prints `All locale files are healthy.` and exits `0`.

### `missing`

```bash
pnpm exec locale-keysmith missing
```

Lists, per non-source locale, the keys that exist in the source locale but are absent.

### `unused`

```bash
pnpm exec locale-keysmith unused
```

Lists source-locale keys that are never referenced in your source files. See
[Key usage detection](#key-usage-detection) for exactly what counts as "referenced".

### `sort`

```bash
pnpm exec locale-keysmith sort           # preview (no changes written)
pnpm exec locale-keysmith sort --write   # write sorted files to disk
```

Sorts keys alphabetically at every nesting level. Without `--write` it only reports which
files would change.

### `remove-unused`

```bash
pnpm exec locale-keysmith remove-unused              # preview
pnpm exec locale-keysmith remove-unused --dry-run    # preview (explicit)
pnpm exec locale-keysmith remove-unused --write      # delete unused keys and re-sort
```

Removes unused keys from **every** locale file (not just the source), then re-sorts them.
Without `--write` it reports how many keys would be removed.

### `translate`

```bash
export GOOGLE_TRANSLATE_API_KEY="your-api-key"
pnpm exec locale-keysmith translate --to de,fr           # preview counts
pnpm exec locale-keysmith translate --from en --to de,fr --write
```

Translates the source locale's missing keys into each target locale using the Google
Translate API. A target locale that has no file yet is created next to the source file.

| Option            | Default | Description                                     |
| ----------------- | ------- | ----------------------------------------------- |
| `--to <locales>`  | —       | Comma-separated target locales (required).      |
| `--from <locale>` | `en`    | Source locale to translate from.                |
| `--write`         | off     | Write results to disk (otherwise preview only). |

Requires the `GOOGLE_TRANSLATE_API_KEY` environment variable.

## Configuration

Configuration is **optional**. With no config file, locale-keysmith scans **only the `src`
folder** — it looks there for locale files (`.json`, `.yml`, `.yaml`) and for source usage,
and any writes are confined to it.

Create `locale-keysmith.config.json` in your project root to customise behaviour.

### Scanning other folders

The simplest knob is `roots` — the folders to scan for both locale files and source usage:

```json
{
  "roots": ["src", "public/locales", "packages/ui"]
}
```

`translationFiles` and `src` are derived from `roots` automatically. For full control you can
set either explicitly, which overrides the derived globs:

```json
{
  "sourceLocale": "en",
  "roots": ["src"],
  "translationFiles": ["src/locales/*.{json,yml,yaml}", "public/locales/**/*.{json,yml,yaml}"],
  "src": ["src/**/*.{ts,tsx,js,jsx,vue}"],
  "ignoreKeys": ["debug.*"]
}
```

### Fields and defaults

| Field              | Default                                                   | Purpose                                               |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------- |
| `sourceLocale`     | `"en"`                                                    | Locale treated as the source of truth.                |
| `roots`            | `["src"]`                                                 | Folders to scan for locale files and source usage.    |
| `translationFiles` | `<root>/**/*.{json,yml,yaml}` per root                    | Globs for locale files (overrides the derived globs). |
| `src`              | `<root>/**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte}` per root | Globs for source files (overrides the derived globs). |
| `ignoreKeys`       | `[]`                                                      | Key patterns excluded from audits (`*` wildcard).     |

`node_modules`, `dist`, and `.next` are always ignored. The locale of each file is inferred
from its filename (`en.json` → `en`, `pt-BR.yaml` → `pt-BR`).

### Key usage detection

`unused`, `remove-unused`, and `health` treat a key as used whether it is passed directly or
referenced indirectly. All of these are detected:

```ts
t("app.title"); // direct call (also i18n.t / $t / translate)
<Trans i18nKey="banner.welcome" />; // JSX i18nKey prop
t(online ? "status.online" : "status.offline"); // ternary branches

const priorityKey = { low: "priority.low", high: "priority.high" };
t(priorityKey[level]); // value from a lookup object

const tagKeys = ["tag.work", "tag.urgent"]; // keys in an array
const FOOTER = "footer.copyright"; // key in a constant
```

Any string literal shaped like a dotted key path (e.g. `"a.b.c"`) is counted as used. The one
thing that cannot be resolved statically is a **dynamically built** key, which is therefore
not detected:

```ts
t(`theme.${mode}`); // theme.dark / theme.light are NOT detected
```

## Development

```bash
pnpm run lint        # ESLint (typescript-eslint, flat config)
pnpm run format      # Prettier --write
pnpm run test        # Vitest
pnpm run coverage    # Vitest with v8 coverage
pnpm run check       # lint + format:check + build + test
```
