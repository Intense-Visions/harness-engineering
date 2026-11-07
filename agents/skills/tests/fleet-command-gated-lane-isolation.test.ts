// agents/skills/tests/fleet-command-gated-lane-isolation.test.ts
//
// Guard: a fleet-command lane that parks at its member's CONFIRM gate must not
// run in a host-managed, auto-cleaned worktree.
//
// Claude Code's Agent tool removes an `isolation: "worktree"` worktree when the
// agent stops with no changes. A lane parks at CONFIRM right after a read-only
// SELECT, so it parks with a clean tree, and the worktree is deleted. When the
// conductor resumes the lane with the human's answer, the lane runs in the
// PARENT's cwd, which is the shared checkout, and it gets no signal that its
// isolation has lapsed. It cost eight lanes their worktrees across three runs
// before it was reproduced deterministically.
//
// The rule has two halves, and both must ship. The first is an explicit
// worktree that outlives the stop. The second is a toplevel guard on every
// resume, so any other way of losing isolation fails loudly instead of writing
// into the shared tree. This test pins both halves in the spine doc and in
// every platform copy of the conductor.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(SKILLS_DIR, '..', '..');
const FAMILY_MD = resolve(REPO_ROOT, 'docs/reference/fleet-family.md');
const PLATFORMS = ['claude-code', 'codex', 'cursor', 'gemini-cli'];

/** The text of one markdown section, from its heading to the next heading of the same or a higher level. */
function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return '';
  const level = /^#+/.exec(heading)![0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = /^(#+)\s/.exec(l);
    return m !== null && m[1].length <= level;
  });
  return [heading, ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
}

describe('gated-lane worktree isolation', () => {
  it('the family spine documents the auto-clean hazard and both halves of the rule', () => {
    const body = section(
      readFileSync(FAMILY_MD, 'utf8'),
      '## Gated lanes and the unchanged-worktree auto-clean'
    );
    expect(body, 'section missing from fleet-family.md').not.toBe('');
    expect(body).toMatch(/auto-clean/i);
    expect(body).toMatch(/git worktree add \.\.\//);
    expect(body).toMatch(/--show-toplevel/);
    expect(body).toMatch(/shared checkout/);
  });

  for (const platform of PLATFORMS) {
    it(`${platform}: fleet-command DISPATCH requires an explicit worktree and a resume guard`, () => {
      const file = resolve(SKILLS_DIR, platform, 'fleet-command/SKILL.md');
      expect(existsSync(file), `${file} missing`).toBe(true);
      const dispatch = section(
        readFileSync(file, 'utf8'),
        '### Phase 3: DISPATCH — Wave-by-Wave Lane Scheduling Under the Global Governor'
      );
      expect(dispatch, 'DISPATCH section not found').not.toBe('');
      const rule = /\*\*Gated lanes get an explicit worktree\.\*\*[^\n]*/.exec(dispatch);
      expect(rule, 'gated-lane rule missing from DISPATCH').not.toBeNull();
      expect(rule![0]).toMatch(/git worktree add \.\.\//);
      expect(rule![0]).toMatch(/--show-toplevel/);
      expect(rule![0]).toMatch(/fleet-family\.md/);
    });
  }
});
