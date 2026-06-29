#!/usr/bin/env node
/**
 * design-craft capture command for the dashboard.
 *
 * Renders dashboard *pages* via a headless browser and prints a
 * `[{ file, image, component }]` manifest on stdout — the contract
 * `harness design_craft --mode deep` expects from a `captureCommand`. The
 * harness CLI ships no browser of its own (by design); this project-side script
 * supplies the render+screenshot step.
 *
 * Playwright is an OPT-IN, lazily-imported dependency so it is NOT forced on
 * every install / CI run. To use deep-mode capture:
 *
 *   1. pnpm add -Dw playwright && npx playwright install chromium
 *   2. Run the dashboard:  pnpm --filter @harness-engineering/dashboard dev
 *   3. Invoke design-craft with:
 *        captureCommand = "node scripts/design-capture.mjs"
 *      and `files` set to dashboard page paths
 *      (packages/dashboard/src/client/pages/*.tsx).
 *
 * Input: the candidate files arrive as a JSON array in the
 * `HARNESS_DESIGN_CRAFT_FILES` env var (set by design-craft). The dashboard
 * dev-server URL is `DASHBOARD_BASE_URL` (default `http://localhost:3700`,
 * overridable via `DASHBOARD_CLIENT_PORT`).
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pages whose route slug differs from their lowercased filename. */
const SLUG_OVERRIDES = { decaytrends: 'decay' };

/** Map a page file path to its `/s/<slug>` route slug. */
export function slugForFile(file) {
  const name = basename(file, extname(file)).toLowerCase();
  return SLUG_OVERRIDES[name] ?? name;
}

/** Parse the `HARNESS_DESIGN_CRAFT_FILES` env var into a string[] (tolerant). */
export function parseTargetFiles(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((f) => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Keep only dashboard *page* files — only routes can be navigated to and
 * screenshotted; loose components have no standalone URL without a render
 * harness, so they are skipped.
 */
export function pageFiles(files) {
  return files.filter((f) => f.includes('/pages/') && f.endsWith('.tsx'));
}

/** Build the base dashboard URL from env. */
export function baseUrl(env = process.env) {
  if (env.DASHBOARD_BASE_URL) return env.DASHBOARD_BASE_URL;
  return `http://localhost:${env.DASHBOARD_CLIENT_PORT ?? '3700'}`;
}

async function main() {
  const targets = pageFiles(parseTargetFiles(process.env.HARNESS_DESIGN_CRAFT_FILES));
  if (targets.length === 0) {
    process.stderr.write(
      'design-capture: no dashboard page files in HARNESS_DESIGN_CRAFT_FILES ' +
        '(expected packages/dashboard/src/client/pages/*.tsx).\n'
    );
    process.stdout.write('[]\n');
    return;
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    process.stderr.write(
      'design-capture: playwright is not installed. Run ' +
        '`pnpm add -Dw playwright && npx playwright install chromium`.\n'
    );
    process.exit(1);
  }

  const base = baseUrl();
  const outDir = mkdtempSync(join(tmpdir(), 'design-capture-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const manifest = [];
  try {
    for (const file of targets) {
      const slug = slugForFile(file);
      const url = `${base}/s/${slug}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
        await page.waitForTimeout(500);
      } catch (err) {
        process.stderr.write(`design-capture: failed to load ${url}: ${err.message}\n`);
        continue;
      }
      const image = join(outDir, `${slug}.png`);
      await page.screenshot({ path: image, fullPage: true });
      manifest.push({ file, image, component: basename(file, extname(file)) });
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify(manifest) + '\n');
}

// Only run when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`design-capture: ${err.message}\n`);
    process.exit(1);
  });
}
