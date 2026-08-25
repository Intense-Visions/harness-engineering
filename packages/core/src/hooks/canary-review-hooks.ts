// packages/core/src/hooks/canary-review-hooks.ts
//
// Canary auto-wiring at REVIEW / FINAL_REVIEW (issue #1482).
//
// Harness already detects whether canary is present (the `canary_probe` MCP
// tool, backed by `CanaryAdapter.probe()`, returns `status: "available"`), and
// the `skillHooks` framework already gives every review moment a dispatch path
// for additional review skills. This module bridges the two: when canary is
// present, autopilot's REVIEW and FINAL_REVIEW stages run canary's deterministic
// test detectors ALONGSIDE (never replacing) `harness-code-reviewer`, reusing the
// exact `skillHooks` dispatch/context machinery — no per-project config required.
//
// FORWARD-WIRED / GRACEFUL-SKIP CONTRACT (the crux, do not regress):
//   The four detectors are harness-OPTIMISTIC defaults. They are NOT guaranteed
//   to be installed — as of canary 5.12.0 the plugin ships NONE of them (its
//   review-adjacent skills are `canary-test-reviewer`, `canary-pr-guardian`,
//   `canary-ci-ready`, `canary-critical-areas`, ...). So a canary default whose
//   skill is not installed is SILENTLY SKIPPED (reported in the denominator),
//   NEVER a hard halt. Each detector auto-lights-up if/when canary ships it.
//   This is the opposite of a USER-declared `skillHooks` entry: a user's typo
//   MUST hard-halt (false-green protection). The distinction is drawn HERE by
//   resolve-and-filter — a canary default is only emitted when its skill is
//   reported available; the consuming skill therefore never has to hard-halt on
//   a canary default (it filtered out the missing ones already), while it keeps
//   hard-halting on unresolvable USER hooks from `resolveSkillHooks`.
//
// Availability is supplied BY THE CALLER (the consuming skill knows its installed
// skill catalog). This keeps the module PURE and IO-free, exactly like
// `skill-lifecycle.ts` — presence AND availability are inputs, not probes. When
// availability is unknown (undefined), a detector is treated as NOT installed and
// skipped: the safe default is "wire nothing extra", never "wire an optimistic
// default that then hard-halts".

import { defaultBlocking, resolveSkillHooks } from './skill-lifecycle';
import type { NormalizedHook, SkillHookEntry, SkillHooksConfigHolder } from './skill-lifecycle';

/**
 * Canary's DETERMINISTIC test detectors, in dispatch order. Each finds a
 * distinct, non-overlapping defect class, so merging their findings needs no
 * dedup:
 *
 * - `canary-savant`     — order dependence: shared-state leakage between tests.
 * - `canary-blackhawk`  — temporal dependence: wall-clock, timezone, DST, Feb 29.
 * - `canary-katana`     — tests deleted or newly skipped by a change (diff-aware,
 *                         the archetypal review-stage check).
 * - `canary-cassandra`  — vacuous tests: assertions that cannot fail.
 *
 * These are the SPECIFIC deterministic detectors named by issue #1482. They are
 * FORWARD-WIRED: canary 5.12.0 ships none of them, so today they all skip; each
 * activates automatically once canary ships it and it reports as installed.
 */
export const CANARY_REVIEW_DETECTORS = [
  'canary-savant',
  'canary-blackhawk',
  'canary-katana',
  'canary-cassandra',
] as const;

/**
 * The autopilot events at which canary detectors auto-wire. Exactly the two
 * review moments — REVIEW (per-phase) and FINAL_REVIEW (cross-phase). Both
 * tokenize to a `review` moment, so {@link defaultBlocking} makes the wired
 * detector hooks blocking, matching the built-in review gate.
 */
export const CANARY_REVIEW_EVENTS = ['after:REVIEW', 'after:FINAL_REVIEW'] as const;

/** The host skill canary detectors attach to. */
export const CANARY_REVIEW_HOST_SKILL = 'harness-autopilot';

/**
 * How a caller reports which skills are installed/dispatchable. A set or array of
 * skill names, or a predicate. `undefined` means "availability unknown" — every
 * detector is then treated as NOT installed (skipped), never optimistically wired.
 */
export type SkillAvailability =
  | ReadonlySet<string>
  | readonly string[]
  | ((skill: string) => boolean);

/**
 * The outcome of resolving canary's default detectors at a review event: which
 * are WIRED (installed → ready to dispatch as blocking hooks), which are SKIPPED
 * (not installed → forward-wired, no hard halt), and the full EXPECTED set (the
 * denominator the consuming skill reports, e.g. "2/4 detectors ran, 2 skipped:
 * not installed").
 */
export interface CanaryReviewDetectorPlan {
  wired: NormalizedHook[];
  skipped: string[];
  expected: readonly string[];
}

function isCanaryReviewEvent(event: string): boolean {
  // Matched case-sensitively against the canonical uppercase keys documented in
  // harness-autopilot/SKILL.md.
  return (CANARY_REVIEW_EVENTS as readonly string[]).includes(event);
}

/** Normalize the three availability shapes into a single predicate. */
function toAvailabilityPredicate(avail: SkillAvailability | undefined): (skill: string) => boolean {
  if (avail === undefined) return () => false;
  if (typeof avail === 'function') return avail;
  const set = avail instanceof Set ? avail : new Set(avail);
  return (skill) => set.has(skill);
}

/**
 * Skill names a project DECLARES at `skillName`/`event`, including entries parked
 * with `enabled: false`. This is deliberately the RAW declared set (not the
 * post-`enabled`-filter set `resolveSkillHooks` returns): a project that parks a
 * detector via `{ type: "skill", skill: "canary-cassandra", enabled: false }` has
 * expressed an explicit opt-out, so the canary default for that name must be
 * dropped rather than silently re-injected. Honors the `enabled: false` "park a
 * hook without running it" contract for the auto-wired defaults too. Bare strings
 * and `{ type: "skill" }` objects both name a skill.
 */
function declaredSkillNames(
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

/**
 * Plan canary's default detectors at `event`, given canary presence and which
 * skills are installed. Partitions {@link CANARY_REVIEW_DETECTORS} into `wired`
 * (installed → blocking `skill` hooks) and `skipped` (not installed → dropped
 * without a hard halt), and reports the `expected` denominator.
 *
 * - `canaryPresent === false` ⇒ empty plan (canary absent = today's behavior).
 * - `event` not a canary review event ⇒ empty plan (detectors wire ONLY at
 *   REVIEW / FINAL_REVIEW).
 * - otherwise ⇒ every detector reported available is wired; the rest are skipped.
 */
export function planCanaryReviewDetectors(
  canaryPresent: boolean,
  event: string,
  availableSkills?: SkillAvailability
): CanaryReviewDetectorPlan {
  if (!canaryPresent || !isCanaryReviewEvent(event)) {
    return { wired: [], skipped: [], expected: [] };
  }
  const blocking = defaultBlocking(event);
  const isInstalled = toAvailabilityPredicate(availableSkills);
  const wired: NormalizedHook[] = [];
  const skipped: string[] = [];
  for (const skill of CANARY_REVIEW_DETECTORS) {
    if (isInstalled(skill)) {
      wired.push({ type: 'skill', skill, blocking });
    } else {
      skipped.push(skill);
    }
  }
  return { wired, skipped, expected: CANARY_REVIEW_DETECTORS };
}

/**
 * The canary detector hooks that auto-wire at `event` when canary is present AND
 * the detector's skill is installed. A convenience over
 * {@link planCanaryReviewDetectors} that returns just the dispatchable `wired`
 * hooks. Not-installed detectors are silently skipped (see the module contract);
 * use {@link planCanaryReviewDetectors} when you also need the skipped list for
 * the denominator report.
 */
export function resolveCanaryReviewHooks(
  canaryPresent: boolean,
  event: string,
  availableSkills?: SkillAvailability
): NormalizedHook[] {
  return planCanaryReviewDetectors(canaryPresent, event, availableSkills).wired;
}

/**
 * The EFFECTIVE review hooks for `skillName` at `event`: the project's configured
 * `skillHooks` (via {@link resolveSkillHooks}) FOLLOWED BY the INSTALLED canary
 * detector defaults ({@link planCanaryReviewDetectors}) when canary is present.
 *
 * Ordering: configured hooks first (a project's explicit intent leads), installed
 * canary defaults appended. A canary default whose detector name is ALREADY
 * DECLARED at this event is dropped — the project's explicit entry wins. Dedup is
 * against the RAW declared names (including `enabled: false` entries), so a
 * project can override a detector's `blocking` by re-declaring it, OR park it
 * entirely with `enabled: false`; either way the auto-wired default never
 * re-appears. Configured non-`skill` hooks (`prompt`/`command`) and non-detector
 * `skill` hooks are always preserved.
 *
 * A canary default whose skill is NOT installed is never emitted here (it is
 * skipped, not hard-halted). This is what makes the feature forward-wired and
 * keeps hard-halt semantics exclusive to unresolvable USER-declared hooks (which
 * flow through `resolveSkillHooks` unchanged).
 *
 * When canary is absent this returns exactly `resolveSkillHooks(...)` — so a
 * project without canary sees no behavioral change (no regression).
 */
export function resolveReviewHooksWithCanary(
  config: SkillHooksConfigHolder | null | undefined,
  skillName: string,
  event: string,
  opts: { canaryPresent: boolean; availableSkills?: SkillAvailability }
): NormalizedHook[] {
  const configured = resolveSkillHooks(config, skillName, event);

  // Canary defaults only attach to autopilot's review events; a different host
  // skill or a non-review event never gains canary detectors.
  if (skillName !== CANARY_REVIEW_HOST_SKILL) return configured;

  const { wired } = planCanaryReviewDetectors(opts.canaryPresent, event, opts.availableSkills);
  if (wired.length === 0) return configured;

  const declared = declaredSkillNames(config, skillName, event);
  const additions = wired.filter((hook) => hook.type === 'skill' && !declared.has(hook.skill));
  return [...configured, ...additions];
}
