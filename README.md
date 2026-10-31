# locale-keysmith

Sort, audit, clean, and translate i18n locale files from the command line.

## Install

```bash
pnpm add -D locale-keysmith
```

Requires Node.js 22.12 or newer.

## Quick start

```bash
# Write a starter config based on the locale files in your project (optional)
pnpm exec locale-keysmith init

# See which locale files are detected
pnpm exec locale-keysmith scan

# Get a full report: missing keys, unused keys, and unsorted files
pnpm exec locale-keysmith health
```

By default everything is scanned under the `src` folder. To look elsewhere, add a config
file (see [Configuration](#configuration)).

## Commands

Run a command with `pnpm exec locale-keysmith <command>` (or `npx locale-keysmith <command>`).

| Command                    | What it does                                                             |
| -------------------------- | ------------------------------------------------------------------------ |
| `init`                     | Write a starter `locale-keysmith.config.json` for this project.          |
| `scan`                     | List the locale files that were found, with their inferred locale.       |
| `health`                   | Run every check below plus extra keys, empty values and type mismatches. |
| `missing`                  | List keys present in the source locale but missing from the others.      |
| `unused`                   | List source-locale keys that no source file references.                  |
| `sort`                     | Sort every locale file's keys alphabetically (nested too).               |
| `remove-unused`            | Delete unused keys from every locale file.                               |
| `translate --to <locales>` | Fill missing keys in target locales via Google Translate.                |

### Using it in CI

`scan`, `missing`, `unused` and `health` accept `--json` and print a machine-readable
result on stdout (warnings go to stderr, so stdout always parses):

```bash
pnpm exec locale-keysmith health --json
```

```json
{
  "healthy": false,
  "issueCount": 1,
  "issues": [{ "type": "missing", "file": "src/locales/de.json", "locale": "de", "key": "status.offline" }]
}
```

Exit codes:

| Code | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| `0`  | Nothing to report.                                                                |
| `1`  | `missing`, `unused` or `health` found something.                                  |
| `2`  | The command itself failed (invalid config, unreadable locale file, API error...). |

### `init`

```bash
pnpm exec locale-keysmith init           # refuses to overwrite an existing config
pnpm exec locale-keysmith init --force   # overwrite it
```

Looks for locale files in the project (skipping `node_modules`, build output, and test or
fixture folders) and writes a config with:

- `sourceLocale`: `en` (or an English variant) when present, otherwise the locale with the most
  keys.
- `roots`: the top-level folders that hold locale files, plus `src`, `app`, `pages`,
  `components`, `lib` and `packages` when they exist.

### `scan`

```bash
pnpm exec locale-keysmith scan
```

Prints one line per detected locale file, e.g. `en  src/locales/en.json`. Matched JSON/YAML
files that are not locale files (see [How locale files are recognised](#how-locale-files-are-recognised))
are listed underneath as skipped, so you can see why a file you expected is missing:

```
en src/locales/en.json
de src/locales/de.json

Skipped 1 file whose name or folder is not a locale code:
  src/locales/english.json
```

With `--json`, the skipped files are in the `skipped` array.

### `health`

```bash
pnpm exec locale-keysmith health
```

A one-shot audit. It prints each problem it finds:

```
unsorted src/locales/de.json
duplicate en nav.home
missing de status.offline
extra de legacy.oldButton
empty de app.tagline
type-mismatch de menu (object in the source, string here)
unused draft.placeholder

7 issues found.
```

| Issue           | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `unsorted`      | The file's keys are not in alphabetical order (fix with `sort --write`).      |
| `duplicate`     | The file defines a key twice, e.g. `"nav.home"` and `"nav": { "home" }`.      |
| `missing`       | A key from the source locale is absent in this locale.                        |
| `extra`         | This locale has a key the source locale does not (often a leftover).          |
| `empty`         | The value is an empty or whitespace-only string, or `null`.                   |
| `type-mismatch` | The key holds a different kind of value than in the source (text vs. object). |
| `unused`        | No source file references the key.                                            |

It exits with a non-zero status when any issue is found, so it can gate CI. When everything
is fine it prints `All locale files are healthy.` and exits `0`. Keys matching `ignoreKeys`
are skipped by every check.

### `missing`

```bash
pnpm exec locale-keysmith missing
```

Lists, per non-source locale, the keys that exist in the source locale but are absent.

Plural keys follow each language's plural rules, as i18next does: English `item_one` /
`item_other` means Polish needs `item_one`, `item_few`, `item_many` and `item_other`, while
Japanese only needs `item_other`. Neither is reported as missing or extra for doing so, and
`translate` fills plural forms the source language lacks from its `_other` text.

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
It lists every key it removes; without `--write` it only lists the keys that would be removed.

### `translate`

```bash
export GOOGLE_TRANSLATE_API_KEY="your-api-key"
pnpm exec locale-keysmith translate --to de,fr           # preview counts
pnpm exec locale-keysmith translate --from en --to de,fr --write
```

Translates the source locale's missing keys into each target locale using the Google
Translate API. A target locale that has no file yet is created next to the source file. Keys
matching `ignoreKeys` are not translated.

| Option            | Default                 | Description                                     |
| ----------------- | ----------------------- | ----------------------------------------------- |
| `--to <locales>`  | —                       | Comma-separated target locales (required).      |
| `--from <locale>` | `sourceLocale` (config) | Source locale to translate from.                |
| `--write`         | off                     | Write results to disk (otherwise preview only). |

Requires the `GOOGLE_TRANSLATE_API_KEY` environment variable; it is sent in a request header,
never in the URL.

- **Placeholders are protected.** `{{name}}`, `{count}`, ICU messages such as
  `{count, plural, ...}`, `<0>…</0>` and other tags, `$t(key)` and `%s` are passed through
  untranslated. If a translation comes back with a placeholder missing, that key is skipped
  with a warning rather than written broken. (The text inside an ICU message is kept as is.)
- **Progress is saved.** If a request fails midway, the keys translated so far are written
  before the error is reported, so rerunning only translates what is left.
- Keys are sent in batches of up to 100 strings per request.

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

The config is checked before any command runs. Wrong types (`"roots": "src"` instead of
`["src"]`), a `sourceLocale` that is not a locale code, and unknown fields (with a "did you
mean" hint for typos) are all reported together.

`node_modules`, `dist`, and `.next` are always ignored.

### How locale files are recognised

A matched file is only treated as a locale file when its name or its directory is a locale
code, so config files such as `package.json` or `src/data/config.json` are never read or
rewritten:

| Path                            | Locale  | Notes                                   |
| ------------------------------- | ------- | --------------------------------------- |
| `src/locales/en.json`           | `en`    | from the file name                      |
| `config/locales/pt-BR.yml`      | `pt-BR` | `pt_BR`, `zh-Hant`, `es-419` work too   |
| `public/locales/de/common.json` | `de`    | from the directory (i18next namespaces) |
| `src/data/config.json`          | —       | skipped: not a locale file              |

Files are compared only with their own translations: `app/locales/de.json` with
`app/locales/en.json`, `public/locales/de/common.json` with `public/locales/en/common.json`.
That lets one config cover several independent sets of locale files (an app and a plugin, or
several namespaces). Two files for the same locale in one set (say `en.json` and `en.yaml`
side by side) are reported as an error.

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

Any string literal shaped like a dotted key path (e.g. `"a.b.c"`) is counted as used, including
one that only appears in a comment. Keys are also matched the way i18next resolves them at
runtime:

```ts
t("cart.item", { count }); // cart.item_one, cart.item_other, cart.item_zero, ... are used
t("friend.greeting", { context }); // friend.greeting_male, friend.greeting_female, ... are used
t("common:common.title"); // namespaced: common.title is used
```

A **dynamically built** key cannot be resolved statically, so every key under its static
prefix is treated as used. That is never reported or removed:

```ts
t(`theme.${mode}`); // every key under theme. (theme.dark, theme.light, ...) is used
t("errors." + code); // every key under errors. is used
```

## Development

```bash
pnpm run lint        # ESLint (typescript-eslint, flat config)
pnpm run format      # Prettier --write
pnpm run test        # Vitest
pnpm run coverage    # Vitest with v8 coverage
pnpm run check       # lint + format:check + build + test
```
