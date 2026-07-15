import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lint guard for the two copies of the local-backend prompt template
 * (local-backend-full-workflow Phase 2). Both copies must:
 *   - be byte-identical (SC6) — the repo-root copy is what `harness init`
 *     drops in; the `templates/orchestrator/` copy is the scaffold source;
 *   - invoke gates using command names that actually exist (SC5) — no
 *     `harness verify` (branch-naming only) or `harness outcome-eval`
 *     (nonexistent CLI), and DO use `harness validate`;
 *   - preserve the `{{ issue.* }}` / `{{ attempt }}` render variables (SC7)
 *     so the dispatch renderer's interpolation contract is not broken.
 */

// Test file lives at packages/orchestrator/src/ ; repo root is four levels up.
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const ROOT_TEMPLATE = path.join(REPO_ROOT, 'harness.orchestrator.local.md');
const SCAFFOLD_TEMPLATE = path.join(
  REPO_ROOT,
  'templates',
  'orchestrator',
  'harness.orchestrator.local.md'
);

const rootContent = fs.readFileSync(ROOT_TEMPLATE, 'utf8');
const scaffoldContent = fs.readFileSync(SCAFFOLD_TEMPLATE, 'utf8');

describe('local template lint — byte identity (SC6)', () => {
  it('the repo-root copy and the templates/orchestrator copy are byte-identical', () => {
    expect(rootContent).toBe(scaffoldContent);
  });
});

describe('local template lint — corrected gate command names (SC5)', () => {
  for (const [label, content] of [
    ['repo-root', rootContent],
    ['scaffold', scaffoldContent],
  ] as const) {
    it(`${label}: does not reference the non-gate command "harness verify"`, () => {
      expect(content).not.toMatch(/harness verify/);
    });

    it(`${label}: does not reference the nonexistent command "harness outcome-eval"`, () => {
      expect(content).not.toMatch(/harness outcome-eval/);
    });

    it(`${label}: uses the real "harness validate" gate`, () => {
      expect(content).toMatch(/harness validate/);
    });

    it(`${label}: does not instruct slash commands (unavailable on this backend)`, () => {
      expect(content).not.toMatch(/\/harness:/);
    });
  }
});
