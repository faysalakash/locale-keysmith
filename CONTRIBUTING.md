# Contributing to locale-keysmith

Bug reports and pull requests are welcome. For a larger change, open an issue first so we
can agree on the approach.

## Setup

You need **Node.js 26.13.0** and **pnpm 12.16.1**, the versions pinned in `.tool-versions`
(asdf and mise pick them up automatically). The published package supports Node.js 22.12 and
newer; CI tests 22.12.0, 22, 24 and 26.

```bash
pnpm install
pnpm dev --help   # run the CLI from source (tsx src/cli.ts)
```

## Scripts

```bash
pnpm run lint        # ESLint (typescript-eslint, flat config)
pnpm run format      # Prettier --write
pnpm run test        # Vitest
pnpm run coverage    # Vitest with v8 coverage
pnpm run check       # lint + format:check + build + test (what CI runs)
```

## Tests

- Modules in `src/` have unit tests in `test/<module>.test.ts`.
- `test/cli.test.ts` runs the real CLI against temporary copies of the projects in
  `test/fixtures/`, so behaviour changes should get a test there.
- `pnpm run test` never calls Google Translate. To check `translate` against the real API
  (placeholders, HTML entities, batching, error messages), run the live tests with a key. A
  full run sends about 2,000 characters:

  ```bash
  GOOGLE_TRANSLATE_API_KEY="your-api-key" pnpm run test:live
  ```

## Project layout

| File                 | Responsibility                                            |
| -------------------- | --------------------------------------------------------- |
| `src/cli.ts`         | Commands, output and exit codes                           |
| `src/checks.ts`      | Missing, extra, empty, duplicate and type-mismatch checks |
| `src/config.ts`      | Loading and validating the config file                    |
| `src/init.ts`        | Config detection for `init`                               |
| `src/keys.ts`        | Key paths: flatten, get, set, delete, sort                |
| `src/locale-path.ts` | Recognising locale codes in file and folder names         |
| `src/parser.ts`      | Reading and writing JSON/YAML, keeping formatting         |
| `src/scanner.ts`     | Finding locale files and grouping translations            |
| `src/translate.ts`   | Google Translate requests and placeholder masking         |
| `src/usage.ts`       | Detecting which keys the source code uses                 |

## Pull requests

- Start the title with a [Conventional Commits](https://www.conventionalcommits.org/) type:
  `feat:`, `fix:`, `docs:`, `test:`, `ci:` or `chore:`.
- `pnpm run check` must pass; CI runs the same checks on every pull request.
- Update `README.md` when user-facing behaviour changes.

## Releasing

For maintainers:

1. Bump `version` in `package.json` in a commit titled `chore: release vX.Y.Z`.
2. Merge it into `main` with **Rebase and merge** or **Squash and merge**, so the commit on
   `main` keeps that title. A merge commit does not trigger a release.
3. The Publish workflow publishes to npm through trusted publishing (with provenance), then
   creates the `vX.Y.Z` tag and a GitHub release with generated notes. A version that is
   already on npm is skipped.
