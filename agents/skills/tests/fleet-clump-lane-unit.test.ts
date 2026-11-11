// agents/skills/tests/fleet-clump-lane-unit.test.ts
//
// Guard: the execution seam of clumping (docs/changes/clumping/proposal.md,
// Phase 5) — a clump is the LANE UNIT in the four build-shaped `-fleet`
// members, and VERIFY settles ONE verdict per clump under D10.
//
// Why this test exists at all. `roadmap-fleet`, `bug-fleet`, `cleanup-fleet`
// and `craft-fleet` are SKILL.md files; nothing in this repository schedules
// their lanes, so their DISPATCH and VERIFY contracts are prose an agent reads.
// Phases 3 and 4 both learned the cost of that: a seam described in prose has
// nothing behind it, and a paragraph cannot be held to anything. The family's
// answer — `harness fleet budget-check`, then `harness fleet clump-issues` —
// is to give the contract a callable; `harness fleet clump-dispatch` is this
// phase's. THIS file is the other half: it pins that the prose actually points
// at the callable, in every platform copy, so a future edit that quietly drops
// the lane unit back to one-item-per-lane fails here instead of shipping.
//
// Each assertion names the PROPERTY it is protecting, so a mutant that trips an
// encoding check while the property still holds is visible as such.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(SKILLS_DIR, '..', '..');
const FAMILY_MD = resolve(REPO_ROOT, 'docs/reference/fleet-family.md');

const PLATFORMS = ['claude-code', 'codex', 'cursor', 'gemini-cli'];

/** The four members whose lane unit a clump becomes, with their phase headings. */
const MEMBERS = [
  {
    fleet: 'roadmap-fleet',
    dispatch: '### Phase 3: DISPATCH — Worktree Fan-Out With a Concurrency Governor',
    verify: '### Phase 4: VERIFY — Independent Confirmation, Never Self-Report',
  },
  {
    fleet: 'bug-fleet',
    dispatch: '### Phase 3: DISPATCH — Worktree Fan-Out With a Concurrency Governor',
    verify: '### Phase 4: VERIFY — Two Independent Proofs, Never Self-Report',
  },
  {
    fleet: 'cleanup-fleet',
    dispatch: '### Phase 3: DISPATCH — Worktree Fan-Out With a Concurrency Governor',
    verify: '### Phase 4: VERIFY — Independent Confirmation, Never Self-Report',
  },
  {
    fleet: 'craft-fleet',
    dispatch: '### Phase 3: DISPATCH — Worktree Fan-Out With a Concurrency Governor',
    verify: '### Phase 4: VERIFY — Three Independent Proofs, Never Self-Report',
  },
] as const;

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

function skill(platform: string, fleet: string): string {
  const file = resolve(SKILLS_DIR, platform, `${fleet}/SKILL.md`);
  expect(existsSync(file), `${file} missing`).toBe(true);
  return readFileSync(file, 'utf8');
}

describe('the clump is the lane unit in the four build-shaped members', () => {
  for (const platform of PLATFORMS) {
    for (const { fleet, dispatch } of MEMBERS) {
      it(`${platform}/${fleet}: DISPATCH takes a clump and honors one-PR-per-clump`, () => {
        const body = section(skill(platform, fleet), dispatch);
        expect(body, `DISPATCH section not found in ${platform}/${fleet}`).not.toBe('');

        const rule = /\*\*The lane unit is a CLUMP, not [^*]*\.\*\*[\s\S]*?\n\n/.exec(body);
        expect(rule, `lane-unit rule missing from ${platform}/${fleet} DISPATCH`).not.toBeNull();
        const text = rule![0];

        // PROPERTY 1: the lane takes a clump, and does so through the CALLABLE,
        // not by an agent's reading of what a clump is.
        expect(text, 'the rule does not point at the callable').toContain(
          'harness fleet clump-dispatch'
        );
        // PROPERTY 2: one branch, one PR, one commit per member. All three,
        // because dropping any one of them breaks the contract: no branch and
        // the lane is unisolated, no single PR and the clump is not a unit, and
        // no commit-per-member and D10's drop becomes a lane re-run.
        expect(text).toMatch(/one branch/i);
        expect(text).toMatch(/one PR/i);
        expect(text).toMatch(/one commit per member/i);
        // PROPERTY 3: the contract is referenced, not restated as local policy.
        expect(text).toContain('fleet-family.md');
      });

      it(`${platform}/${fleet}: DISPATCH says WHY commit-per-member, not just that it happens`, () => {
        // A rule stating the shape without the reason is the one a future edit
        // "simplifies" into a squashed commit. The economics claim has to be in
        // the prose, because it is the thing that makes the shape load-bearing.
        const body = section(skill(platform, fleet), dispatch);
        const rule = /\*\*The lane unit is a CLUMP, not [^*]*\.\*\*[\s\S]*?\n\n/.exec(body)![0];
        expect(rule).toMatch(/one-commit revert|one commit per member is/i);
        expect(rule).toMatch(/N times as expensive/i);
      });
    }
  }
});

describe('VERIFY settles one verdict per clump (D10)', () => {
  for (const platform of PLATFORMS) {
    for (const { fleet, verify } of MEMBERS) {
      it(`${platform}/${fleet}: a failing member is dropped, not the clump`, () => {
        const body = section(skill(platform, fleet), verify);
        expect(body, `VERIFY section not found in ${platform}/${fleet}`).not.toBe('');

        const rule = /\*\*One verdict per clump \(D10\)\.\*\*[\s\S]*?\n\n/.exec(body);
        expect(rule, `D10 rule missing from ${platform}/${fleet} VERIFY`).not.toBeNull();
        const text = rule![0];

        // PROPERTY 1: ONE verdict for the clump — the thing D10 actually says.
        expect(text).toMatch(/exactly ONE verdict|ONE verdict/);
        expect(text).toMatch(/never one per member/i);
        // PROPERTY 2: the drop is a revert of the MEMBER'S OWN commit, and the
        // clump proceeds. Without "its own commit" the rule is satisfied by
        // reverting the branch, which drops the good members too.
        expect(text).toMatch(/reverting its own commit/i);
        expect(text).toMatch(/proceeds with the rest/i);
        // PROPERTY 3: the drop is RECORDED with its reason. A reasonless drop
        // is a silent delete wearing a verdict.
        expect(text).toMatch(/recording the drop and its reason/i);
        // PROPERTY 4: the two — and only the two — failure conditions.
        expect(text).toMatch(/empty/i);
        expect(text).toMatch(/no longer builds/i);
        // PROPERTY 5: an unrun post-drop build is not a green one.
        expect(text).toMatch(/not run is not a green one/i);
        // PROPERTY 6: it is settled by the callable, and the exit code is the check.
        expect(text).toContain('--verdict');
        expect(text).toMatch(/exits 13/);
      });
    }
  }
});

describe('craft-fleet READS the clumps its craft skills emit', () => {
  // This is the specific thing Phase 3 recorded as required and did not close:
  // the craft seam emitted `clumps` at 21 call sites and NOTHING read them.
  for (const platform of PLATFORMS) {
    it(`${platform}: SELECT reads output.clumps instead of re-folding findings`, () => {
      const body = section(
        skill(platform, 'craft-fleet'),
        '### Phase 1: SELECT — Compose the Craft Skills, Floor, Route, Rank'
      );
      expect(body, 'SELECT section not found').not.toBe('');

      const rule = /\*\*Read the targets off `output\.clumps`[^*]*\*\*[\s\S]*?\n\n/.exec(body);
      expect(rule, 'the read-the-clumps rule is missing from craft-fleet SELECT').not.toBeNull();
      const text = rule![0];

      // PROPERTY 1: the targets come from the emitted block, and a target IS a clump.
      expect(text).toMatch(/A \*\*target\*\* IS a clump/);
      // PROPERTY 2: hand re-folding is forbidden, not merely discouraged.
      expect(text).toMatch(/never re-fold the findings by hand/i);
      // PROPERTY 3: the adapter that produces the block is named, so the claim
      // is checkable against code rather than taken on faith.
      expect(text).toContain('shared/craft/findings/clumpable.ts');
    });

    it(`${platform}: a findings-only run is a gap to report, never a licence to fold by hand`, () => {
      // The failure mode this phase closes is NOT "craft-fleet groups wrongly";
      // it is "craft-fleet silently falls back to its own grouping when the
      // grouped view is absent", which looks identical to working.
      const body = section(
        skill(platform, 'craft-fleet'),
        '### Phase 1: SELECT — Compose the Craft Skills, Floor, Route, Rank'
      );
      expect(body).toMatch(/carries `findings` and no `clumps` is a gap to report/i);
      expect(body).toContain('harness fleet clump-dispatch');
    });

    it(`${platform}: the two honest limits of the craft clump set are recorded`, () => {
      // Phase 3 discovered both. Recording them in the SKILL is what stops the
      // next reader rediscovering them the expensive way.
      const body = section(
        skill(platform, 'craft-fleet'),
        '### Phase 1: SELECT — Compose the Craft Skills, Floor, Route, Rank'
      );
      // `target.file` is absolute ⇒ craft clump scope and id are not portable.
      expect(body).toMatch(/absolute/);
      expect(body).toMatch(/not portable between machines/i);
      // No touched set at this seam ⇒ `'act'` is structurally unreachable.
      expect(body).toMatch(/never `'act'`/);
    });
  }
});

describe('the spine states the contract once for the family', () => {
  it('fleet-family.md carries the one-PR-per-clump contract and D10', () => {
    const body = section(
      readFileSync(FAMILY_MD, 'utf8'),
      '## The clumping floor (work-unit granularity)'
    );
    expect(body, 'clumping section missing from fleet-family.md').not.toBe('');
    expect(body).toMatch(/one commit per member/i);
    expect(body).toMatch(/one verdict per clump/i);
    expect(body).toMatch(/reverting its own commit/i);
  });

  it('the CONTRACT paragraph itself names the execution callable', () => {
    // The sibling of the `budget-check` precedent: a contract the spine states
    // and nothing can run is a contract nothing is held to.
    //
    // Scoped to the contract PARAGRAPH, not to the section. A section-wide
    // `toContain` passed a mutant that stripped the callable from this very
    // paragraph, because the "Current state" paragraph further down happens to
    // name it too — a second mention elsewhere is not the same property, and a
    // check two different sentences can satisfy cannot tell which one is gone.
    const body = section(
      readFileSync(FAMILY_MD, 'utf8'),
      '## The clumping floor (work-unit granularity)'
    );
    const contract = /\*\*The one-PR-per-clump contract\.\*\*[\s\S]*?\n\n/.exec(body);
    expect(contract, 'the one-PR-per-clump contract paragraph is missing').not.toBeNull();
    expect(contract![0]).toContain('harness fleet clump-dispatch');
    expect(contract![0]).toMatch(/--verdict/);
  });
});
