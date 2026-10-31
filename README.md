# locale-keysmith

[![npm](https://img.shields.io/npm/v/locale-keysmith)](https://www.npmjs.com/package/locale-keysmith)
[![Test](https://github.com/faysalakash/locale-keysmith/actions/workflows/test.yml/badge.svg)](https://github.com/faysalakash/locale-keysmith/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/npm/l/locale-keysmith)](LICENSE)

Keep your i18n locale files complete and tidy, from the command line or in CI.

locale-keysmith finds your locale files (JSON or YAML), compares every translation with the
source language, and checks which keys your code still uses. It can then sort the files,
delete unused keys, and fill in missing translations with Google Translate.

- **Audit:** one `health` command reports missing, extra, unused, duplicate and empty keys,
  type mismatches and unsorted files.
- **Clean up:** `sort` and `remove-unused` rewrite files while keeping their indentation, line
  endings and YAML comments.
- **Translate:** fill missing keys via Google Translate, with `{{placeholders}}`, ICU messages
  and `<0>tags</0>` kept intact.
- **CI-ready:** `--json` output, and exit codes that tell "issues found" apart from "the check
  itself failed".
- **Zero config:** works out of the box for a `src` folder; `init` writes a config for
  anything else.

## Works with

locale-keysmith is built around **i18next** conventions, as used by react-i18next,
next-i18next and i18next-http-backend: plural suffixes (`_one`, `_other`, ...), context,
namespaces and `keyPrefix` are all understood.

Other libraries that keep translations in JSON/YAML key files and read them with `t("key")`
or `$t("key")` (vue-i18n, for example) work for the key checks, but plural forms are checked
by i18next's rules.

## Install

```bash
npm install --save-dev locale-keysmith
# or: pnpm add -D locale-keysmith
# or: yarn add -D locale-keysmith
```

Or run it without installing anything: `npx locale-keysmith health`.

Requires Node.js 22.12 or newer.

## Quick start

```bash
npx locale-keysmith init     # optional: write a config based on the locale files found
npx locale-keysmith scan     # see which locale files are detected
npx locale-keysmith health   # report everything that needs attention
```

By default everything is scanned under the `src` folder. To look elsewhere, run `init` or add
a config file (see [Configuration](#configuration)).

## Commands

The examples use `npx locale-keysmith <command>`; with pnpm or yarn, `pnpm exec` or `yarn`
work the same way.

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

### `init`

```bash
npx locale-keysmith init           # refuses to overwrite an existing config
npx locale-keysmith init --force   # overwrite it
```

Looks for locale files in the project (skipping `node_modules`, build output, and test or
fixture folders) and writes a config with:

- `sourceLocale`: `en` (or an English variant) when present, otherwise the locale with the most
  keys.
- `roots`: the top-level folders that hold locale files, plus `src`, `app`, `pages`,
  `components`, `lib` and `packages` when they exist.

### `scan`

```bash
npx locale-keysmith scan
```

Prints one line per detected locale file. Matched JSON/YAML files that are not locale files
(see [How locale files are recognised](#how-locale-files-are-recognised)) are listed
underneath as skipped, so you can see why a file you expected is missing:

```text
en src/locales/en.json
de src/locales/de.json

Skipped 1 file whose name or folder is not a locale code:
  src/locales/english.json
```

With `--json`, the skipped files are in the `skipped` array.

### `health`

```bash
npx locale-keysmith health
```

A one-shot audit. It prints each problem it finds:

```text
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
npx locale-keysmith missing
```

Lists, per non-source locale, the keys that exist in the source locale but are absent.

Plural keys follow each language's plural rules, as i18next does: English `item_one` /
`item_other` means Polish needs `item_one`, `item_few`, `item_many` and `item_other`, while
Japanese only needs `item_other`. Neither is reported as missing or extra for doing so, and
`translate` fills plural forms the source language lacks from its `_other` text.

### `unused`

```bash
npx locale-keysmith unused
```

Lists source-locale keys that are never referenced in your source files. See
[Key usage detection](#key-usage-detection) for exactly what counts as "referenced".

### `sort`

```bash
npx locale-keysmith sort           # preview (no changes written)
npx locale-keysmith sort --write   # write sorted files to disk
```

Sorts keys alphabetically at every nesting level. Without `--write` it only reports which
files would change.

### `remove-unused`

```bash
npx locale-keysmith remove-unused              # preview
npx locale-keysmith remove-unused --dry-run    # preview (explicit)
npx locale-keysmith remove-unused --write      # delete unused keys and re-sort
```

Removes unused keys from **every** locale file (not just the source), then re-sorts them.
It lists every key it removes; without `--write` it only lists the keys that would be removed.

> **Warning:** `--write` deletes translations. Commit your work first and read the list it prints: a key
> that your code builds entirely at runtime cannot be detected (see
> [Key usage detection](#key-usage-detection)). Protect such keys with `ignoreKeys`.

### `translate`

```bash
export GOOGLE_TRANSLATE_API_KEY="your-api-key"
npx locale-keysmith translate --to de,fr           # preview counts
npx locale-keysmith translate --from en --to de,fr --write
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

#### Getting an API key

1. In the [Google Cloud console](https://console.cloud.google.com/), create or select a
   project. It needs a billing account.
2. Enable the **Cloud Translation API** (APIs & Services → Library).
3. Create a key under APIs & Services → Credentials → **Create credentials → API key**.
4. Restrict the key to the Cloud Translation API, then export it as `GOOGLE_TRANSLATE_API_KEY`.

Google charges per translated character, with a monthly free allowance; see
[Cloud Translation pricing](https://cloud.google.com/translate/pricing). Run without
`--write` first to see how many keys would be sent.

## Using it in CI

`health` fails the job when it finds anything, which makes it a one-line CI check:

```yaml
# .github/workflows/i18n.yml
name: i18n
on: pull_request

jobs:
  locales:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npx --yes locale-keysmith@0 health
```

If locale-keysmith is a dev dependency, run your install step (`npm ci`) and then
`npx locale-keysmith health`, so CI uses the version in your lockfile. To check only for
missing translations, use `missing` instead of `health`.

Exit codes:

| Code | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| `0`  | Nothing to report.                                                                |
| `1`  | `missing`, `unused` or `health` found something.                                  |
| `2`  | The command itself failed (invalid config, unreadable locale file, API error...). |

`scan`, `missing`, `unused` and `health` accept `--json` and print a machine-readable
result on stdout (warnings go to stderr, so stdout always parses):

```bash
npx locale-keysmith health --json
```

```json
{
  "healthy": false,
  "issueCount": 1,
  "issues": [{ "type": "missing", "file": "src/locales/de.json", "locale": "de", "key": "status.offline" }]
}
```

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

const { t } = useTranslation("translation", { keyPrefix: "settings" });
t("title"); // keyPrefix: settings.title is used (also getFixedT(lng, ns, "settings"))
```

In a file that sets a `keyPrefix`, every key is counted both with and without the prefix,
since another `t` in the same file may not use it. A `keyPrefix` built at runtime cannot be
resolved, so keep its keys out of `remove-unused` with `ignoreKeys`.

A **dynamically built** key cannot be resolved statically, so every key under its static
prefix is treated as used. That is never reported or removed:

```ts
t(`theme.${mode}`); // every key under theme. (theme.dark, theme.light, ...) is used
t("errors." + code); // every key under errors. is used
```

A key computed entirely at runtime (`t(keyFromServer)`) leaves no trace in the source, so it
is reported as unused. Add such keys to `ignoreKeys`.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
development setup.

## License

[MIT](LICENSE) © Faysal Ahmed Akash
