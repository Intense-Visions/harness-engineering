import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Repo root is 4 levels up from packages/orchestrator/tests/prompt/.
const repoRoot = path.resolve(__dirname, '../../../../');

const TEMPLATES = [
  path.join(repoRoot, 'harness.orchestrator.local.md'),
  path.join(repoRoot, 'templates/orchestrator/harness.orchestrator.local.md'),
];

describe('harness.orchestrator.local.md lint (Phase 1 SC2)', () => {
  for (const file of TEMPLATES) {
    describe(path.relative(repoRoot, file), () => {
      const body = fs.readFileSync(file, 'utf-8');

      it('exists and is non-empty', () => {
        expect(body.trim().length).toBeGreaterThan(0);
      });

      it('contains NO /harness: slash-command instructions', () => {
        expect(body).not.toContain('/harness:');
      });

      it('invokes gates as bash `harness <gate>` calls', () => {
        expect(body).toContain('harness verify');
        expect(body).toContain('harness outcome-eval');
      });
    });
  }
});
