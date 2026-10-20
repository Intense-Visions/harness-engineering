import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { minimatch } from 'minimatch';
import { parse } from '@typescript-eslint/typescript-estree';
import { skipDirGlobs } from '@harness-engineering/graph';
import { findFiles, relativePosix } from '../../../src/shared/fs-utils';
import { detectDuplication } from '../../../src/entropy/detectors/duplication';
import { normalizeTokens } from '../../../src/duplication/tokens';
import { extractUnits } from '../../../src/duplication/units';
import type { CodebaseSnapshot } from '../../../src/entropy/types';

const REPO_ROOT = join(__dirname, '../../../../..');

/**
 * Criterion 6's scope: "this repository's non-test sources". Reproduced as
 * `buildSnapshot`'s own default discovery narrowed to the TS/JS extensions
 * `isEligibleFile` admits.
 */
const INCLUDE = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'];

/**
 * `detectDuplication` reads only `files[].path` and `rootDir`, so a synthetic
 * snapshot exercises THE DETECTOR rather than a multi-minute tree-sitter
 * snapshot build (planning decision P8; same construction as
 * `architecture/collectors/complexity.ts:8-26`).
 */
function snapshotOf(paths: string[], rootDir: string): CodebaseSnapshot {
  return {
    files: paths.map((path) => ({
      path,
      ast: { type: 'Program', body: null, language: 'typescript' },
      imports: [],
      exports: [],
      internalSymbols: [],
      jsDocComments: [],
    })),
    dependencyGraph: { nodes: [], edges: [] },
    exportMap: { byFile: new Map(), byName: new Map() },
    docs: [],
    codeReferences: [],
    entryPoints: [],
    rootDir,
    config: { rootDir, analyze: {} },
    buildTime: 0,
  } as unknown as CodebaseSnapshot;
}

/**
 * Spec success criterion 6 is an ABSOLUTE wall-clock bar ("under 10 seconds"),
 * and this file deliberately does NOT assert it with a clock.
 *
 * The bar is met with room to spare — measured 2.9-3.1 s over the real scope
 * below — but the measurement is not stable enough to gate on. During this
 * change the SAME code measured 3.0 s and then 8-9 s on the same machine
 * minutes apart under a load average of 39, and a reference implementation
 * timed alongside it slowed by the identical factor. A 3x swing eats all the
 * headroom a 10 s bar leaves over a 3 s run, so a timing assertion here would
 * be a flake generator that tells us nothing about the code: it goes red when
 * the machine is busy and green when a real regression lands on a quiet one.
 *
 * So criterion 6 is verified two other ways, and the recorded measurement with
 * its discovery scope lives in this change's verification notes:
 *
 *   1. `asserts the token-visit count is linear in the source` below — the
 *      DETERMINISTIC structural property the binary search in
 *      `duplication/tokens.ts` buys. It is a count, not a duration, so it
 *      cannot flake, and it does fail if that optimization is reverted.
 *   2. `completes a real scan over this repository's non-test sources` below —
 *      proves the detector actually runs at the criterion's scale and refuses
 *      to report a pass over a discovery that silently returned nothing.
 */
describe('detectDuplication performance (spec criterion 6)', () => {
  it('asserts the token-visit count is linear in the source, not units x tokens', () => {
    // A dense but realistic file: many sibling units plus some nesting, which
    // is the shape that makes a per-unit rescan quadratic.
    const parts: string[] = [];
    for (let i = 0; i < 60; i++) {
      parts.push(
        `export function unit${i}(alpha: number, beta: readonly number[]): number {`,
        `  let total${i} = alpha * ${i + 2};`,
        `  for (const value of beta) {`,
        `    total${i} += value % ${i + 3} === 0 ? value : -value;`,
        `  }`,
        `  const refine${i} = (extra: number): number => extra + total${i};`,
        `  return refine${i}(total${i});`,
        `}`
      );
    }
    const source = parts.join('\n');
    const program = parse(source, { tokens: true, loc: true, range: true });
    const tokens = program.tokens ?? [];
    const units = extractUnits(program);

    // Pin both denominators before measuring, so a degenerate parse cannot
    // make the bound trivially satisfiable.
    expect(tokens.length).toBeGreaterThan(2000);
    expect(units.length).toBeGreaterThan(100);

    // Count element reads of the token array. `length` is a string key and is
    // not counted; every `tokens[i]` is.
    let visits = 0;
    const counted = new Proxy(tokens, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) visits++;
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof tokens;

    for (const unit of units) normalizeTokens(counted, unit.range);

    // The analytic bound for a binary search plus a bounded forward walk:
    // ceil(log2(n+1)) probes to find the window, then one read per token that
    // STARTS inside the unit's range, plus the one read that trips the break.
    //
    // Summing per-unit spans is deliberately not the same as "total tokens":
    // a token inside a nested unit is read once per enclosing unit, so the
    // honest claim is linear in the SOURCE (spans sum to total tokens times
    // nesting depth), not in `units x tokens`. Both are asserted below.
    const probes = Math.ceil(Math.log2(tokens.length + 1));
    let bound = 0;
    for (const unit of units) {
      const [start, end] = unit.range;
      const startsInside = tokens.filter((t) => t.range[0] >= start && t.range[0] <= end).length;
      bound += startsInside + 1 + probes;
    }

    expect(visits).toBeLessThanOrEqual(bound);

    // And the claim that actually names the regression: a per-unit rescan
    // costs exactly `units x tokens`. Assert we are an order of magnitude
    // under it, and that the gap is wide enough for the comparison to mean
    // something.
    const quadratic = units.length * tokens.length;
    expect(quadratic).toBeGreaterThan(bound * 10);
    expect(visits).toBeLessThan(quadratic / 10);
  });

  it("completes a real scan over this repository's non-test sources", async () => {
    const exclude = [...skipDirGlobs(), '**/*.test.ts', '**/*.spec.ts'];
    const discovered: string[] = [];
    for (const pattern of INCLUDE) discovered.push(...(await findFiles(pattern, REPO_ROOT)));
    const paths = [...new Set(discovered)].filter(
      (f) => !exclude.some((p) => minimatch(relativePosix(REPO_ROOT, f), p))
    );

    // Refuse to report a pass over a scan that did not happen. A broken
    // discovery would otherwise make this the fastest test in the suite.
    expect(paths.length).toBeGreaterThan(500);

    const result = await detectDuplication(snapshotOf(paths, REPO_ROOT));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Proof the scan was real, without asserting this repository's class
    // count (spec criterion 10 forbids that).
    expect(result.value.stats.filesScanned).toBeGreaterThan(500);
    expect(result.value.stats.unitsFingerprinted).toBeGreaterThan(0);
    // A scan of real sources must not be silently degrading: if this ever
    // starts skipping files, that is a finding, not a pass.
    expect(result.value.stats.filesSkipped).toBe(0);
  });
});
