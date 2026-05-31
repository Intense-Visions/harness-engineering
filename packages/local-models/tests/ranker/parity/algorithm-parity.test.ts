/**
 * Parity tests for the `rankModels` orchestrator.
 *
 * Each fixture (`m3-max-36gb.json`, `rtx-4090-24gb.json`) pins the top-1
 * recommendation the algorithm produces against the bundled benchmark
 * snapshot for the two hardware profiles called out in spec success criteria
 * Q1 and Q2. The fixtures are committed to the repo and replayed in CI; CI
 * never invokes the upstream whichllm process. Refreshing the fixtures is a
 * manual maintenance task tied to each v1.x release — the file format is
 * intentionally small so a diff review is fast.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (success criteria Q1, Q2)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rankModels } from '../../../src/ranker/algorithm.js';
import { loadFrozenSnapshot } from '../../../src/ranker/benchmarks/snapshot.js';
import type { HardwareProfile } from '../../../src/hardware/types.js';
import type { RankerCandidate } from '../../../src/ranker/types.js';

interface ParityFixture {
  /** Operator-facing name for the fixture row. */
  label: string;
  /** Hardware profile to score against. */
  hardware: HardwareProfile;
  /** Candidates to rank (aligned with the bundled snapshot's models). */
  candidates: readonly RankerCandidate[];
  /** Top-1 reference: hfRepoId + a score band that catches drift but tolerates calibration tuning. */
  expected: {
    hfRepoId: string;
    scoreMin: number;
    scoreMax: number;
  };
  /** One-sentence rationale for the maintainer who later refreshes the file. */
  note: string;
}

const fixtureDir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): ParityFixture {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as ParityFixture;
}

const fixtures: Array<{ file: string; success: string }> = [
  { file: 'm3-max-36gb.json', success: 'Q1' },
  { file: 'rtx-4090-24gb.json', success: 'Q2' },
];

describe('rankModels parity fixtures', () => {
  for (const { file, success } of fixtures) {
    it(`${file} (${success}) — top-1 matches the frozen reference`, async () => {
      const fixture = loadFixture(file);
      const { snapshot } = await loadFrozenSnapshot();
      const result = rankModels({
        candidates: fixture.candidates,
        hardware: fixture.hardware,
        snapshot,
      });
      expect(result.ranked.length).toBeGreaterThan(0);
      const top = result.ranked[0];
      expect(top).toBeDefined();
      if (!top) return;
      expect(top.hfRepoId).toBe(fixture.expected.hfRepoId);
      expect(top.score).toBeGreaterThanOrEqual(fixture.expected.scoreMin);
      expect(top.score).toBeLessThanOrEqual(fixture.expected.scoreMax);
      expect(top.fitsHardware).toBe(true);
    });
  }
});
