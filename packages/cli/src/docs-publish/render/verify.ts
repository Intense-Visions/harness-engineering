/**
 * Render verification via Playwright.
 *
 * Playwright is an OPTIONAL peer dependency (a hard dep would force a browser
 * download on every `pnpm install` of the published CLI). The import is guarded
 * behind an injectable importer: when it throws (peer absent), verifyRender
 * returns a `degraded: 'playwright-not-installed'` non-verdict — never a pass.
 *
 * The importer is a parameter (defaulting to `() => import('playwright')`) so
 * tests can inject a throwing importer without mocking the module system.
 */
import type { VerifyRenderInput, VerifyRenderResult } from '../interface.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- Playwright is an optional
   peer with no types available at build time; its handles are typed `any` and
   confined to this module. */
type PlaywrightModule = { chromium: any };
export type PlaywrightImporter = () => Promise<PlaywrightModule>;

const defaultImporter: PlaywrightImporter = () =>
  // Playwright may be absent (optional peer) — the caller's try/catch degrades.
  import('playwright' as any) as Promise<PlaywrightModule>;

/** DOM-side assertion payload counted inside the page (see `page.evaluate`). */
interface RenderCounts {
  imagesLoaded: number;
  mediaCardErrors: number;
  mediaSingleCount: number;
  mediaGroupCount: number;
}

/**
 * The in-page counting script, passed to `page.evaluate` as a STRING so it is
 * never type-checked against the CLI's Node lib (which has no DOM types): it
 * runs in the browser context, not here. Counts loaded images, media-card
 * errors, and mediaSingle-vs-mediaGroup nodes.
 */
const COUNT_SCRIPT = `() => {
  const imagesLoaded = Array.from(document.querySelectorAll('img')).filter((img) => img.naturalWidth > 0).length;
  const mediaCardErrors = document.querySelectorAll('.media-card-error').length;
  const mediaSingleCount = document.querySelectorAll('[data-node-type="mediaSingle"]').length;
  const mediaGroupCount = document.querySelectorAll('[data-node-type="mediaGroup"]').length;
  return { imagesLoaded, mediaCardErrors, mediaSingleCount, mediaGroupCount };
}`;

function degraded(): VerifyRenderResult {
  return {
    ok: false,
    imagesLoaded: 0,
    mediaCardErrors: 0,
    mediaSingleCount: 0,
    mediaGroupCount: 0,
    degraded: 'playwright-not-installed',
    failures: [
      'Playwright is not installed. Run `pnpm add -D playwright && npx playwright install chromium` to enable render verification.',
    ],
  };
}

/**
 * Load the target URL in a headless browser and assert the render:
 *   - every `<img>` has `naturalWidth > 0`  → imagesLoaded
 *   - zero `.media-card-error` nodes         → mediaCardErrors (must be 0)
 *   - `mediaSingle` vs `mediaGroup` counts   → mediaGroupCount expected 0
 *
 * `ok = imagesLoaded > 0 && mediaCardErrors === 0 && mediaGroupCount === 0`.
 * Counting loaded images alone is insufficient: `mediaGroup` thumbnail cards
 * ALSO pass `naturalWidth > 0`, so the group count is asserted explicitly.
 */
export async function verifyRender(
  input: VerifyRenderInput,
  importer: PlaywrightImporter = defaultImporter
): Promise<VerifyRenderResult> {
  let pw: PlaywrightModule;
  try {
    pw = await importer();
  } catch {
    return degraded();
  }

  let browser: any;
  try {
    browser = await pw.chromium.launch();
    const page = await browser.newPage();
    await page.goto(input.targetUrl, { waitUntil: 'networkidle' });

    const counts = (await page.evaluate(COUNT_SCRIPT)) as RenderCounts;

    const failures: string[] = [];
    if (counts.imagesLoaded === 0) failures.push('No images loaded (naturalWidth > 0 count is 0).');
    if (counts.mediaCardErrors > 0)
      failures.push(`${counts.mediaCardErrors} media-card-error node(s) present (must be 0).`);
    if (counts.mediaGroupCount > 0)
      failures.push(
        `${counts.mediaGroupCount} mediaGroup node(s) present — figures silently downgraded (expected 0).`
      );

    return {
      ok: counts.imagesLoaded > 0 && counts.mediaCardErrors === 0 && counts.mediaGroupCount === 0,
      imagesLoaded: counts.imagesLoaded,
      mediaCardErrors: counts.mediaCardErrors,
      mediaSingleCount: counts.mediaSingleCount,
      mediaGroupCount: counts.mediaGroupCount,
      failures,
    };
  } catch (err) {
    return {
      ok: false,
      imagesLoaded: 0,
      mediaCardErrors: 0,
      mediaSingleCount: 0,
      mediaGroupCount: 0,
      failures: [`Render verification failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  } finally {
    // Always close the browser, even on assertion/navigation failure.
    if (browser) await browser.close();
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
