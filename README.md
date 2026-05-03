# locale-keysmith

Sort, audit, clean, and translate locale files from the command line.

## Install

```bash
pnpm add -D locale-keysmith
```

## Commands

```bash
npx locale-keysmith scan
npx locale-keysmith sort --write
npx locale-keysmith missing
npx locale-keysmith unused
npx locale-keysmith remove-unused --dry-run
npx locale-keysmith translate --from en --to de,fr --write
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
npx locale-keysmith translate --from en --to de --write
```

## Publish

```bash
pnpm run check
pnpm pack --dry-run
pnpm publish
```

For scoped public packages:

```bash
pnpm publish --access public
```
