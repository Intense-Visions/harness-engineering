// packages/core/src/hooks/skill-availability.ts
//
// The one place that answers "is this skill installed?" for every review host.
//
// `canary-review-hooks.ts` and `craft-review-hooks.ts` each carried a private,
// byte-identical copy of `bareSkillName` and `declaredSkillNames` plus a
// near-identical `toAvailabilityPredicate` differing only in its probe-form
// list. Phase 1 left the duplication deliberately — a second host is the
// earliest point at which the right shape of the abstraction is knowable — and
// Phase 3 is that point.
//
// The parity law in tests/hooks/skill-availability.test.ts is what makes this
// module LOAD-BEARING rather than merely present: a single deletion here must
// redden BOTH hosts. A mutant that reddens only one proves the other kept a
// private copy.

import type { SkillHookEntry, SkillHooksConfigHolder } from './skill-lifecycle';

/**
 * How a caller reports which skills are installed/dispatchable. A set or array
 * of skill names, or a predicate. `undefined` means "availability unknown" —
 * every skill is then treated as NOT installed (skipped), never optimistically
 * wired.
 */
export type SkillAvailability =
  | ReadonlySet<string>
  | readonly string[]
  | ((skill: string) => boolean);

/**
 * Reduce a catalog entry to the bare skill name it designates.
 *
 * Plugins expose their skills plugin-qualified, so a real installed catalog
 * reports `canary:canary-cassandra` — or, depending on the surface, a deeper
 * path like `canary:skills:claude-code:canary-cassandra:canary-cassandra`. The
 * skill constants in both host tables are BARE, so a plain `set.has()` missed
 * on every lookup and silently skipped everything. That failure was invisible
 * precisely because a skipped default is contractually silent.
 *
 * Skill names contain no colon, so taking the final segment is lossless for
 * them and collapses every qualification depth onto the bare name.
 * `harness-design-craft` keeps its `harness-` prefix — that is part of its
 * canonical name, not a qualification.
 */
export function bareSkillName(entry: string): string {
  const lastColon = entry.lastIndexOf(':');
  return lastColon === -1 ? entry : entry.slice(lastColon + 1);
}

/**
 * Normalize the three availability shapes into one predicate. `undefined` means
 * nothing is installed (an unknown catalog is never optimistically wired).
 *
 * `probeForms` is the caller's qualification vocabulary: an enumerable catalog
 * is collapsed onto bare names, but a PREDICATE can only be probed, so the form
 * list IS the coverage — a missing form answers false and the skill is silently
 * skipped. That is the original 0/4 defect surviving in a single shape, which
 * is why the deep plugin-qualified form is pinned by an executable law rather
 * than trusted to a comment.
 */
export function makeAvailabilityPredicate(
  avail: SkillAvailability | undefined,
  probeForms: readonly ((skill: string) => string)[]
): (skill: string) => boolean {
  if (avail === undefined) return () => false;
  if (typeof avail === 'function') {
    const probe = avail;
    return (skill) => probeForms.some((form) => probe(form(skill)));
  }
  // Copy UNCONDITIONALLY: aliasing the caller's Set is safe only while this
  // stays read-only, and the caller is often a module-level test fixture.
  const bare = new Set<string>();
  for (const entry of new Set<string>(avail)) bare.add(bareSkillName(entry));
  // S5: the inherited `set.has(skill) || bare.has(skill)` left operand was
  // UNREACHABLE, by subsumption rather than by assertion. `bare` is built as
  // `{ bareSkillName(e) : e in set }`, and every queried skill name contains no
  // colon, so `bareSkillName(skill) === skill`. If `set.has(skill)` is true
  // then `skill` is in `bare` too, so `bare.has(skill)` is also true. The left
  // operand could never decide the result.
  //
  // Removing dead code CANNOT have a mutant: a "restore the clause" mutant
  // reddens nothing, and that is the PROOF it was dead, not a gap in coverage.
  // What is mutant-backed is the extraction itself — see M-PROBE-DEEP in
  // tests/hooks/skill-availability.test.ts.
  //
  // Removed once, here, rather than twice — which is why Phase 1 left it.
  return (skill) => bare.has(skill);
}

/**
 * Skill names a project DECLARES at `skillName`/`event`, including entries
 * parked with `enabled: false`. This is deliberately the RAW declared set (not
 * the post-`enabled`-filter set `resolveSkillHooks` returns): a project that
 * parks a default via `{ type: "skill", skill: "code-craft", enabled: false }`
 * has expressed an explicit opt-out, so the harness default for that name must
 * be dropped rather than silently re-injected. Honors the `enabled: false`
 * "park a hook without running it" contract for the auto-wired defaults too.
 * Bare strings and `{ type: "skill" }` objects both name a skill.
 */
export function declaredSkillNames(
  config: SkillHooksConfigHolder | null | undefined,
  skillName: string,
  event: string
): Set<string> {
  const entries = config?.skillHooks?.[skillName]?.[event];
  const names = new Set<string>();
  if (!Array.isArray(entries)) return names;
  for (const entry of entries as SkillHookEntry[]) {
    if (typeof entry === 'string') {
      names.add(entry);
    } else if (entry.type === 'skill' && typeof entry.skill === 'string') {
      names.add(entry.skill);
    }
  }
  return names;
}
