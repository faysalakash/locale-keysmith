# lingo-keysmith

Sort, audit, clean, and translate locale files from the command line.

## Install

```bash
pnpm add -D lingo-keysmith
```

## Commands

```bash
npx lingo-keysmith scan
npx lingo-keysmith sort --write
npx lingo-keysmith missing
npx lingo-keysmith unused
npx lingo-keysmith remove-unused --dry-run
npx lingo-keysmith translate --from en --to de,fr --write
```

## Config

Create `lingo-keysmith.config.json` in your project:

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
npx lingo-keysmith translate --from en --to de --write
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
