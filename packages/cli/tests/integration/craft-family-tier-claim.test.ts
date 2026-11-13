// packages/cli/tests/integration/craft-family-tier-claim.test.ts
//
// FINAL_REVIEW I-4. AGENTS.md documented the `-craft` family as "11 skills,
// Tier 3". Every craft `skill.yaml` declares `tier: 2`, and `harness.config.json`
// has no `skills` key at all, so there are no `tierOverrides` that could move
// them. The claim was hand-maintained prose about a machine-readable fact, which
// is the only reason it could drift.
//
// This law makes it falsifiable from BOTH directions: the tier and the count are
// DERIVED from the skill.yaml files, and AGENTS.md's sentence has to agree with
// what was derived. Changing a yaml reddens it; changing the sentence reddens it.
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CRAFT_SKILLS_DIR = path.join(REPO_ROOT, 'agents', 'skills', 'claude-code');
const AGENTS_MD = path.join(REPO_ROOT, 'AGENTS.md');

/**
 * The `-craft` FAMILY: directories whose name ends in `-craft`. Deliberately not
 * `*craft*` — that also matches `craft-fleet`, which is a fleet member and not a
 * family member, and silently inflating the denominator is how a count claim
 * goes wrong in the direction nobody checks.
 */
function craftSkillDirs(): string[] {
  return fs
    .readdirSync(CRAFT_SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.endsWith('-craft'))
    .map((e) => e.name)
    .sort();
}

function declaredTier(skill: string): number | null {
  const yaml = fs.readFileSync(path.join(CRAFT_SKILLS_DIR, skill, 'skill.yaml'), 'utf-8');
  const m = yaml.match(/^tier:\s*(\d+)\s*$/m);
  return m ? Number(m[1]) : null;
}

describe("AGENTS.md's craft-family tier claim is derived, not hand-maintained", () => {
  const skills = craftSkillDirs();

  it('[denominator] every -craft skill declares a numeric tier', () => {
    // CARDINALITY CONTROL. A glob that matches nothing makes every assertion
    // below vacuously true: `[].every(...)` is true and `new Set([]).size` is 0.
    // The count is also half of AGENTS.md's claim, so it is asserted here once
    // and compared against the prose below.
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      expect(declaredTier(skill), `${skill}: skill.yaml declares no tier`).not.toBeNull();
    }
  });

  it('declares ONE tier across the whole family', () => {
    // If this ever splits, AGENTS.md cannot state a single tier for the family
    // and the sentence needs rewriting rather than renumbering — so the law
    // fails here, naming the split, instead of silently picking a majority.
    const byTier = new Map<number, string[]>();
    for (const skill of skills) {
      const tier = declaredTier(skill)!;
      byTier.set(tier, [...(byTier.get(tier) ?? []), skill]);
    }
    expect(
      [...byTier.keys()].sort(),
      `the craft family declares mixed tiers: ${JSON.stringify(Object.fromEntries(byTier))}`
    ).toHaveLength(1);
  });

  it('AGENTS.md states the derived tier and the derived count', () => {
    const md = fs.readFileSync(AGENTS_MD, 'utf-8');
    const line = md.split('\n').find((l) => l.includes('The `-craft` family'));
    // VACUITY CONTROL: a missing line makes `undefined` fail the toMatch with a
    // type error rather than a readable verdict, and deleting the sentence
    // outright must not be a way to pass this law.
    expect(line, 'AGENTS.md no longer describes the -craft family').toBeDefined();

    const tier = declaredTier(skills[0]!)!;
    expect(line!, `AGENTS.md must say Tier ${tier} (derived from skill.yaml)`).toContain(
      `Tier ${tier}`
    );
    expect(line!, `AGENTS.md must say ${skills.length} skills (derived from the tree)`).toContain(
      `${skills.length} skills`
    );
  });

  it('no skills.tierOverrides in harness.config.json could move the family', () => {
    // The derivation above reads the DECLARED tier. An override would make the
    // effective tier differ from it, so the claim would need re-deriving from a
    // second source. Today there is no `skills` key at all; if one appears, this
    // fails loudly rather than letting the law quietly measure the wrong thing.
    const config = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'harness.config.json'), 'utf-8')
    );
    // Positive control: the config really was read and really is the repo's.
    expect(config.name).toBeDefined();
    expect(
      config.skills?.tierOverrides,
      'tierOverrides exist — re-derive the claim'
    ).toBeUndefined();
  });
});
