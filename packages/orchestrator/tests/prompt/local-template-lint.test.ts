import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Repo root is 4 levels up from packages/orchestrator/tests/prompt/.
const repoRoot = path.resolve(__dirname, '../../../../');

const TEMPLATES = [
  path.join(repoRoot, 'harness.orchestrator.local.md'),
  path.join(repoRoot, 'templates/orchestrator/harness.orchestrator.local.md'),
];

// The rendered body is everything after the closing frontmatter `---`.
function bodyOf(content: string): string {
  const lines = content.split('\n');
  let dashes = 0;
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '---') {
      dashes++;
      if (dashes === 2) {
        start = i + 1;
        break;
      }
    }
  }
  return lines.slice(start).join('\n');
}

/**
 * SC8 (local-backend-full-workflow Phase 5): the local template is a thin
 * indirection SHIM, not a methodology paraphrase. It delivers the REAL skills
 * via `harness skill run <name> --autonomous` and teaches the `/harness:X` ->
 * `harness skill run harness-X` redirect. The pre-Phase-5 assertion "contains
 * NO /harness: slash commands" is intentionally dropped: the shim now
 * mentions `/harness:` precisely to teach the redirect.
 */
describe('harness.orchestrator.local.md lint (SC8 — indirection shim)', () => {
  for (const file of TEMPLATES) {
    describe(path.relative(repoRoot, file), () => {
      const content = fs.readFileSync(file, 'utf-8');
      const body = bodyOf(content);

      it('exists and is non-empty', () => {
        expect(content.trim().length).toBeGreaterThan(0);
      });

      it('has YAML frontmatter', () => {
        expect(content.startsWith('---\n')).toBe(true);
      });

      it('invokes the real skills via "harness skill run" with --autonomous', () => {
        expect(content).toContain('harness skill run');
        expect(content).toContain('--autonomous');
      });

      it('teaches the /harness:X redirect (slash refs only exist to be redirected)', () => {
        if (content.includes('/harness:')) {
          expect(content).toContain('harness skill run');
        }
      });

      it('is a shim, not a paraphrase (body line budget — fails if methodology is re-inlined)', () => {
        expect(body.split('\n').length).toBeLessThanOrEqual(80);
      });

      it('names the enforced gate (harness validate)', () => {
        expect(content).toContain('harness validate');
      });

      it('preserves the render variables', () => {
        expect(content).toContain('{{ issue.title }}');
        expect(content).toContain('{{ issue.identifier }}');
        expect(content).toContain('{{ issue.description }}');
        expect(content).toContain('{{ attempt }}');
      });
    });
  }
});
