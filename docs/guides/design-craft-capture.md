# design-craft deep mode: capturing dashboard screenshots

`harness design_craft --mode deep` critiques **rendered screenshots** of components
through a vision model, instead of reading source code (`--mode fast`). The harness
CLI ships no browser of its own — the project supplies the render+screenshot step
via a `captureCommand`. This repo's capture command is
[`scripts/design-capture.mjs`](../../scripts/design-capture.mjs), which screenshots
the dashboard's pages with Playwright.

## One-time setup

Playwright is an **opt-in** dependency (it isn't installed by default, to keep
installs and CI light):

```bash
pnpm add -Dw playwright
npx playwright install chromium
```

## Running a deep-mode critique

1. Start the dashboard dev server (client + API):

   ```bash
   pnpm --filter @harness-engineering/dashboard dev
   ```

   The client serves on `http://localhost:3700` by default
   (`DASHBOARD_CLIENT_PORT` / `DASHBOARD_BASE_URL` override it).

2. Invoke `design_craft` in deep mode with the dashboard page files and the
   capture command:

   ```jsonc
   {
     "mode": "deep",
     "phases": ["critique"],
     "autoCapture": "auto",
     "captureCommand": "node scripts/design-capture.mjs",
     "files": [
       "packages/dashboard/src/client/pages/Signals.tsx",
       "packages/dashboard/src/client/pages/Health.tsx",
     ],
   }
   ```

design-craft passes the `files` to the command via the
`HARNESS_DESIGN_CRAFT_FILES` env var (a JSON array). The command navigates to
each page's `/s/<slug>` route, screenshots it full-page, and prints a
`[{ file, image, component }]` manifest on stdout, which deep mode then
vision-critiques.

## Notes & limits

- **Pages only.** Only files under `pages/` map to a navigable route. Loose
  components (`components/*.tsx`) have no standalone URL and are skipped — capture
  the page that composes them. A Storybook (or a per-component render harness)
  would lift this limit later without changing the manifest contract.
- The route slug is the page filename lowercased, with a small override table
  (e.g. `DecayTrends.tsx` → `/s/decay`).
- If Playwright is missing, or a page fails to load, the command writes a clear
  message to stderr; an empty/failed manifest surfaces as a normal design-craft
  error.
