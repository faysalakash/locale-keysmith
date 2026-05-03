# locale-keysmith

Sort, audit, clean, and translate locale files from the command line.

## Install

```bash
pnpm add -D locale-keysmith
```

## Commands

```bash
pnpm exec locale-keysmith scan
pnpm exec locale-keysmith sort --write
pnpm exec locale-keysmith missing
pnpm exec locale-keysmith unused
pnpm exec locale-keysmith remove-unused --dry-run
pnpm exec locale-keysmith translate --from en --to de,fr --write
```

## Config

Create `locale-keysmith.config.json` in your project:

```json
{
  "sourceLocale": "en",
  "translationFiles": [
    "src/locales/*.{json,yml,yaml}",
    "public/locales/**/*.{json,yml,yaml}"
  ],
  "src": ["src/**/*.{ts,tsx,js,jsx,vue}"],
  "ignoreKeys": ["debug.*"]
}
```

## Google Translate

Set a Google Translate API key before running the `translate` command:

```bash
export GOOGLE_TRANSLATE_API_KEY="your-api-key"
pnpm exec locale-keysmith translate --from en --to de --write
```

## Publish

Validate without publishing:

```bash
pnpm run check
pnpm publish --dry-run --access public --no-git-checks
```

Publish from a clean `main` branch:

```bash
pnpm publish --access public
```
