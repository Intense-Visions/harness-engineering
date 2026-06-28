import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoadmapReadSourceViolations } from './roadmap-read-source';

/**
 * Repo guard for invariant R (read-source invariant).
 *
 * Every source file under `packages/<pkg>/src` that references the generated
 * roadmap aggregate must be enumerated in `ROADMAP_READ_ALLOWLIST`. This test
 * fails the moment a NEW reader appears (the real risk), while passing on the
 * curated legacy set. As writers migrate onto `RoadmapStore` in Phase 4, the
 * allowlist shrinks toward `{ regenerator }`.
 *
 * Runs under pre-push `test:coverage` (harness's OWN repo), NOT an adopter
 * `harness validate` rule — the invariant is about harness source, which an
 * adopter clone does not have.
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Could not locate monorepo root (pnpm-workspace.yaml not found)');
    }
    dir = parent;
  }
}

describe('invariant R — roadmap read-source guard (this repo)', () => {
  it('every roadmap.md reader is on ROADMAP_READ_ALLOWLIST (no new readers)', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = findRepoRoot(here);
    const violations = findRoadmapReadSourceViolations(repoRoot);
    expect(
      violations,
      violations.length > 0
        ? `New roadmap.md reader(s) detected. Either migrate them onto RoadmapStore or add ` +
            `them (annotated) to ROADMAP_READ_ALLOWLIST in roadmap-read-source.ts:\n  - ${violations.join('\n  - ')}`
        : undefined
    ).toEqual([]);
  });
});
