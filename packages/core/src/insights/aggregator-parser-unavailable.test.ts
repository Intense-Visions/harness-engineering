/**
 * `composeInsights` must not report Health PASS when the parser cannot run.
 *
 * `gatherEntropyBlock` used to turn any analyzer `Err` into zero counts, so
 * with estree missing (#2267) the snapshot's SNAPSHOT_BUILD_FAILED became
 * "0 dead files, 0 dead exports" and `gatherHealthBlock` reported PASS over a
 * tree it never parsed. `vi.mock` with a throwing factory makes the real default
 * loader's `import()` reject, as a broken install does. The healthy counterpart
 * (same fixture shape, health FAIL) is in `aggregator.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@typescript-eslint/typescript-estree', () => {
  throw new Error("Cannot find module '@typescript-eslint/typescript-estree'");
});

import { composeInsights } from './aggregator';

describe('composeInsights with an unavailable parser (#2267)', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'insights-unavail-'));
    mkdirSync(join(projectPath, 'src'));
    writeFileSync(
      join(projectPath, 'package.json'),
      JSON.stringify({ name: 'fx', main: 'src/index.ts' })
    );
    writeFileSync(join(projectPath, 'src', 'index.ts'), 'export const main = 1;\n');
    writeFileSync(join(projectPath, 'src', 'orphan.ts'), 'export const orphan = 2;\n');
  });
  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('nulls the health and entropy blocks and names the parser in warnings', async () => {
    const report = await composeInsights(projectPath, {
      skip: ['decay', 'attention', 'impact'],
    });

    expect(report.health).toBeNull();
    expect(report.entropy).toBeNull();
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^health: .*SNAPSHOT_BUILD_FAILED.*parser is unavailable/),
        expect.stringMatching(/^entropy: .*SNAPSHOT_BUILD_FAILED.*parser is unavailable/),
      ])
    );
  });
});
