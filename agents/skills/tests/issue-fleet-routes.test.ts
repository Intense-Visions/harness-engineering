// agents/skills/tests/issue-fleet-routes.test.ts
//
// Guard: `issue-fleet` is the intake stage — every downstream fleet reads the
// queue it emits. Its `route` axis therefore has to be able to NAME every
// member that can own an issue. When a new member joins the family and nobody
// updates the enum, issues of that shape get no legal destination: intake
// either force-routes them to the wrong fleet or parks them, and the whole
// class of work silently falls out of the conveyor.
//
// That is not hypothetical. The enum shipped as six values while the family
// had thirteen members, and `docs`/`security`/`perf`/`craft`-shaped issues had
// nowhere to go until a human granted the routes by hand, per run.
//
// The durable fix is not "add the four missing strings" — it is that nothing
// compared the enum against the roster. This test is that comparison. It
// derives BOTH sides from the shipped docs and asserts they partition: every
// family member is either a legal route or an explicitly-declared
// non-destination carrying its reason. A fourteenth member fails this test
// until someone decides which side it lands on.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..'); // agents/skills
const REPO_ROOT = resolve(SKILLS_DIR, '..', '..');

const SKILL_MD = resolve(SKILLS_DIR, 'claude-code/issue-fleet/SKILL.md');
const FAMILY_MD = resolve(REPO_ROOT, 'docs/reference/fleet-family.md');

/** Every `-fleet` member named in the family spine's member table. */
function rosterMembers(): string[] {
  const text = readFileSync(FAMILY_MD, 'utf8');
  const names = new Set<string>();
  for (const line of text.split('\n')) {
    // Member-table rows only: a row whose FIRST cell is a `x-fleet` code span.
    const m = /^\|\s*`([a-z-]+)-fleet`\s*\|/.exec(line);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/** The `route` enum as the IssueCandidate record declares it. */
function routeEnum(): string[] {
  const text = readFileSync(SKILL_MD, 'utf8');
  const m = /route,\s*\/\/ downstream fleet:\s*([a-z |]+)/.exec(text);
  if (!m) throw new Error('route enum not found in issue-fleet SKILL.md');
  return m[1]
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

/**
 * Members the skill explicitly declares are NOT routable destinations, each
 * with its reason. Parsed from the skill so the REASON ships to the reader
 * rather than living only in this test.
 */
function declaredNonDestinations(): string[] {
  const text = readFileSync(SKILL_MD, 'utf8');
  const section = /## Non-destinations\n([\s\S]*?)(?=\n## |\n### |$)/.exec(text);
  if (!section) throw new Error('no "## Non-destinations" section in issue-fleet SKILL.md');
  const names = new Set<string>();
  for (const line of section[1].split('\n')) {
    const m = /^-\s+\*\*`([a-z-]+)-fleet`\*\*\s+—\s+\S/.exec(line);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

describe('issue-fleet route enum vs the -fleet family roster', () => {
  it('names every family member as either a legal route or a declared non-destination', () => {
    const roster = rosterMembers();
    const routes = routeEnum();
    const excluded = declaredNonDestinations();

    // Sanity: the roster must be non-trivial. A parse that silently matched
    // zero rows would make every assertion below vacuously true — a zero
    // denominator is an abstention, not a pass.
    expect(roster.length).toBeGreaterThan(5);

    const accounted = new Set([...routes, ...excluded]);
    const unaccounted = roster.filter((m) => !accounted.has(m));

    expect(
      unaccounted,
      `These -fleet members can own work but issue-fleet can neither route to them ` +
        `nor explain why not: ${unaccounted.join(', ')}. Add each to the route enum, ` +
        `or to "## Non-destinations" with its reason.`
    ).toEqual([]);
  });

  it('routes and non-destinations are disjoint', () => {
    const routes = new Set(routeEnum());
    const both = declaredNonDestinations().filter((m) => routes.has(m));
    expect(both, `declared both routable and non-routable: ${both.join(', ')}`).toEqual([]);
  });

  it('every legal route is a real family member, not an invented destination', () => {
    const roster = new Set(rosterMembers());
    const phantom = routeEnum().filter((r) => !roster.has(r));
    expect(
      phantom,
      `route enum names destinations with no corresponding -fleet member: ${phantom.join(', ')}`
    ).toEqual([]);
  });

  it('every declared non-destination is a real family member', () => {
    const roster = new Set(rosterMembers());
    const phantom = declaredNonDestinations().filter((r) => !roster.has(r));
    expect(phantom, `non-destination names no such member: ${phantom.join(', ')}`).toEqual([]);
  });

  it('the four routes #886 identified as missing are present', () => {
    const routes = new Set(routeEnum());
    for (const r of ['docs', 'security', 'perf', 'craft']) {
      expect(routes.has(r), `route "${r}" missing from the enum`).toBe(true);
    }
  });
});
