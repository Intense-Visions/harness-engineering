// packages/cli/tests/integration/planning-skills-commit-artifacts.test.ts
//
// Regression test for issue #487.
// https://github.com/Intense-Visions/harness-engineering/issues/487
//
// harness-brainstorming and harness-planning create files under
// docs/changes/<feature>/ but never commit them, so the planning paper trail
// stays untracked. Each skill must commit its own artifacts:
//   - brainstorming → commits proposal.md + SKILLS.md after sign-off
//   - planning     → commits the plan file after writing it
//
// Assertions are intentionally loose on exact wording but strict on the
// presence of a `git add docs/changes/` step and a `git commit -m "docs(`
// message inside each skill's Phase 4 section.
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BRAINSTORMING_SKILL_MD = path.join(
  REPO_ROOT,
  'agents',
  'skills',
  'claude-code',
  'harness-brainstorming',
  'SKILL.md'
);
const PLANNING_SKILL_MD = path.join(
  REPO_ROOT,
  'agents',
  'skills',
  'claude-code',
  'harness-planning',
  'SKILL.md'
);

function extractPhase4(skillMd: string): string {
  const match = skillMd.match(/### Phase 4: VALIDATE[\s\S]*?(?=\n### |\n---\n### |\n## )/);
  if (!match) throw new Error('Phase 4 VALIDATE section not found');
  return match[0];
}

describe('planning chain commits docs/changes/<feature>/ artifacts (issue #487)', () => {
  it('harness-brainstorming Phase 4 includes a git commit step for the spec', () => {
    const md = fs.readFileSync(BRAINSTORMING_SKILL_MD, 'utf-8');
    const phase4 = extractPhase4(md);

    expect(phase4).toMatch(/git add docs\/changes\//);
    expect(phase4).toMatch(/git commit -m "docs\(/);
  });

  it('harness-planning Phase 4 includes a git commit step for the plan', () => {
    const md = fs.readFileSync(PLANNING_SKILL_MD, 'utf-8');
    const phase4 = extractPhase4(md);

    expect(phase4).toMatch(/git add docs\/changes\//);
    expect(phase4).toMatch(/git commit -m "docs\(/);
  });
});
