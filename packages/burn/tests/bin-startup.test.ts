/**
 * The hot-path budget guard.
 *
 * `harness-burn-hud line` renders on every statusline repaint and `stop` fires
 * after every assistant turn. Measured while porting: `harness --version` costs
 * ~0.85s to load the CLI's module graph, against the shell statusline's ~0.11s.
 * A single stray `import` from `@harness-engineering/*` into this binary would
 * therefore make the statusline ~8x more expensive with no visible symptom
 * beyond a laggy terminal — exactly the kind of silent regression nobody
 * bisects. So the import graph is asserted, not just the timing.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';

import { afterEach, beforeAll, expect, it } from 'vitest';

import { BIN, makeHud, runBin, type Hud } from './helpers';

let hud: Hud | null = null;

beforeAll(() => {
  if (!existsSync(BIN)) {
    throw new Error(`built binary missing at ${BIN} — run \`pnpm build\` first`);
  }
});

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

it('bundles no @harness-engineering imports', () => {
  // The deterministic half of the guard: this is what actually fails a PR.
  const bundle = readFileSync(BIN, 'utf8');
  expect(bundle).not.toContain('@harness-engineering/');
  // Nothing may be resolved from node_modules at runtime either: a workspace
  // package left external would slip past the string check above. The only
  // legitimate unbundled specifiers are Node builtins.
  // esbuild rewrites `node:fs` to a bare `fs`, so ask Node what is actually a
  // builtin rather than pattern-matching the prefix.
  const specifiers = [...bundle.matchAll(/(?:from|require\()\s*['"]([^'"]+)['"]/g)].map(
    (m) => m[1]!
  );
  const external = [...new Set(specifiers)].filter((s) => !s.startsWith('.') && !isBuiltin(s));
  expect(external).toEqual([]);
});

/** Median of `n` runs, so one scheduler hiccup cannot decide the result. */
async function medianMs(run: () => Promise<unknown>, n = 5): Promise<number> {
  const timings: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const started = performance.now();
    await run();
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  return timings[Math.floor(n / 2)]!;
}

it('starts in the same order of magnitude as bare node', async () => {
  // Measured as a RATIO against `node -e ''` in the same process environment,
  // not as a wall-clock ceiling. An absolute ceiling fails for the wrong
  // reason: this test first ran at 821ms against a 700ms limit purely because
  // the rest of the monorepo's suites were saturating the CPU alongside it.
  // Under load both sides of a ratio inflate together, so it keeps measuring
  // the thing that actually matters — how much this binary adds over merely
  // starting node.
  //
  // Observed on the porting machine: bare node 47ms, this binary 118ms (2.5x),
  // the full harness CLI 902ms (19.2x). A 8x ceiling sits far above the former
  // and far below the latter.
  hud = makeHud();
  writeFileSync(
    hud.paths.summary,
    JSON.stringify({
      generated_at: new Date().toISOString(),
      status: 'OK',
      week: { days_left: 3, hours_left: 72, tz: 'UTC' },
      wtd: { units: 1_000_000 },
      projection: { units_at_reset: 2_000_000, confidence: 'high', ratio_vs_baseline: 1 },
      budget: { set: false },
      models_exhausted: [],
      session: {},
      calibration: {},
    })
  );

  const baseline = await medianMs(
    () =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', '']);
        child.on('error', reject);
        child.on('close', () => resolve());
      })
  );
  const rendered = await medianMs(() => runBin(['line'], hud!.env));

  expect(rendered / baseline).toBeLessThan(8);
});
