// The craft creation seam, proved at the ORCHESTRATOR, not at the adapter
// (docs/changes/clumping/proposal.md, Phase 3).
//
// `clumpable.test.ts` pins the adapter in isolation. This suite runs a REAL
// `runCodeCraft` over a real temp project with a mock LLM and asserts that the
// emitted output carries grouped work units — the thing an agent reading a
// craft run actually sees. An adapter that works and an orchestrator that never
// calls it look identical from the adapter's own tests.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCodeCraft } from '../../src/code-craft';
import { SEED_RUBRICS, rubricApplies } from '../../src/code-craft/catalog/rubrics';

const RUBRICS_FOR_FUNCTION = SEED_RUBRICS.filter((r) => rubricApplies(r, 'function')).length;

const SUBSTANTIVE_FN = (n: number) => `export function classify${n}(x) {
  if (x > 10) {
    return 'big';
  }
  const doubled = x * 2;
  return doubled > 5 ? 'medium' : 'small';
}
`;

describe('runCodeCraft emits clumps alongside findings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-craft-clump-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  /** Four peer files in ONE directory — same scope, same kind, disjoint conflict keys. */
  async function runOverFourPeerFiles() {
    for (let i = 0; i < 4; i += 1) writeFile(`packages/api/src/f${i}.ts`, SUBSTANTIVE_FN(i));
    return runCodeCraft({ path: tmpDir });
  }

  it('four same-(scope, kind) findings become ONE work unit, once per rubric slot', async () => {
    const out = await runOverFourPeerFiles();

    // The mock provider's default verdict is foundational/medium/low — above
    // the floor — so every finding reaches formation.
    expect(out.findings).toHaveLength(4 * RUBRICS_FOR_FUNCTION);
    expect(out.clumps.counts.floored).toBe(0);

    // One clump per rubric slot. Two findings on the SAME file share a conflict
    // key and may never co-clump, which is why the count is the rubric count
    // and not 1 — but each clump still folds four findings into one unit.
    expect(out.clumps.clumps).toHaveLength(RUBRICS_FOR_FUNCTION);
    for (const clump of out.clumps.clumps) {
      expect(clump.members).toHaveLength(4);
      expect(clump.kind).toBe('CODE');
      expect(new Set(clump.members.map((m) => m.scope)).size).toBe(1);
      expect(new Set(clump.conflictKeys)).toHaveLength(4);
    }

    // The headline: the work units an agent would file dropped by 4x.
    const units = out.clumps.clumps.length + out.clumps.counts.solo;
    expect(units).toBe(RUBRICS_FOR_FUNCTION);
    expect(units).toBeLessThan(out.findings.length);
  });

  it('POSITIVE CONTROL: peers in DIFFERENT directories do not fold together', async () => {
    // Without this, a `scope` the adapter collapsed to a constant would produce
    // exactly the same clump count as a correct one on the test above.
    for (let i = 0; i < 4; i += 1) writeFile(`packages/api/src/d${i}/f${i}.ts`, SUBSTANTIVE_FN(i));
    const out = await runCodeCraft({ path: tmpDir });

    expect(out.findings).toHaveLength(4 * RUBRICS_FOR_FUNCTION);
    expect(out.clumps.clumps).toHaveLength(0);

    // Nothing folds, so every finding is its own work unit — and that trips the
    // `maxClumps: 20` cap, which counts EMITTED WORK UNITS rather than findings
    // (D9). The shed items are REPORTED in `overCap`, not dropped: a silent
    // drop and a clean run look identical in output.
    expect(out.clumps.counts.solo).toBe(20);
    expect(out.clumps.counts.overCap).toBe(4 * RUBRICS_FOR_FUNCTION - 20);
    expect(out.clumps.counts.solo + out.clumps.counts.overCap).toBe(4 * RUBRICS_FOR_FUNCTION);
  });

  it('conservation: every emitted finding lands in exactly one bucket', async () => {
    const out = await runOverFourPeerFiles();
    const c = out.clumps.counts;
    expect(c.input).toBe(out.findings.length);
    expect(c.clumped + c.floored + c.overCap + c.ungraded + c.solo).toBe(out.findings.length);
  });

  it('an empty run emits zero clumps and does not fabricate one', async () => {
    const out = await runCodeCraft({ path: tmpDir });
    expect(out.findings).toEqual([]);
    expect(out.clumps.clumps).toEqual([]);
    expect(out.clumps.counts.input).toBe(0);
  });

  it('clump ids are deterministic across two runs over the same project', async () => {
    const first = await runOverFourPeerFiles();
    const second = await runCodeCraft({ path: tmpDir });
    expect(second.clumps.clumps.map((c) => c.id)).toEqual(first.clumps.clumps.map((c) => c.id));
  });
});
