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
// This is a NARROWER default than the general `skillHooks` mechanism: it is an
// additional default layer that fires only when canary is detected. A project's
// explicit `skillHooks` config still applies on top (see
// `resolveReviewHooksWithCanary`).
//
// Like `skill-lifecycle.ts`, this module is PURE and IO-free: it resolves and
// normalizes hooks only. Canary-presence detection is the caller's job (the
// consuming skill probes canary and passes the boolean in). Dispatch, the
// hard-halt/blocking policy, and the "report the denominator" reporting all live
// in the consuming skill — exactly as they do for configured `skillHooks`.

import { defaultBlocking, resolveSkillHooks } from './skill-lifecycle';
import type { NormalizedHook, SkillHooksConfigHolder } from './skill-lifecycle';

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
 * These are the SPECIFIC deterministic detectors — distinct from the
 * general-purpose `canary-review-test` (brittleness / anti-patterns) that
 * structurally cannot find a self-comparing assertion or an order-dependent pass.
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
 * tokenize to a `review` moment, so {@link defaultBlocking} makes the detector
 * hooks blocking, matching the built-in review gate.
 */
export const CANARY_REVIEW_EVENTS = ['after:REVIEW', 'after:FINAL_REVIEW'] as const;

/** The host skill canary detectors attach to. */
export const CANARY_REVIEW_HOST_SKILL = 'harness-autopilot';

function isCanaryReviewEvent(event: string): boolean {
  return (CANARY_REVIEW_EVENTS as readonly string[]).includes(event);
}

/**
 * The canary detector hooks that auto-wire at `event` when canary is present.
 *
 * - `canaryPresent === false` ⇒ `[]` (canary absent = today's exact behavior).
 * - `event` is not a canary review event ⇒ `[]` (detectors wire only at
 *   REVIEW / FINAL_REVIEW; every other phase boundary is untouched).
 * - otherwise ⇒ one `skill` hook per {@link CANARY_REVIEW_DETECTORS}, in order,
 *   blocking per {@link defaultBlocking} (true at both review events).
 *
 * These are emitted as ordinary {@link NormalizedHook}s so the consuming skill
 * dispatches them through the same path — and enforces the same hard-halt on an
 * undispatchable detector — as any configured `skill` hook.
 */
export function resolveCanaryReviewHooks(canaryPresent: boolean, event: string): NormalizedHook[] {
  if (!canaryPresent) return [];
  if (!isCanaryReviewEvent(event)) return [];
  const blocking = defaultBlocking(event);
  return CANARY_REVIEW_DETECTORS.map((skill) => ({ type: 'skill', skill, blocking }));
}

/**
 * The EFFECTIVE review hooks for `skillName` at `event`: the project's configured
 * `skillHooks` (via {@link resolveSkillHooks}) FOLLOWED BY the canary detector
 * defaults ({@link resolveCanaryReviewHooks}) when canary is present.
 *
 * Ordering: configured hooks first (a project's explicit intent leads), canary
 * defaults appended. A canary default whose detector name is ALREADY declared as
 * a configured `skill` hook at this event is dropped — the project's explicit
 * entry (which may carry its own `blocking`/`enabled`) wins, and the detector is
 * never dispatched twice. Configured non-`skill` hooks (`prompt`/`command`) and
 * non-detector `skill` hooks are always preserved.
 *
 * When canary is absent this returns exactly `resolveSkillHooks(...)` — so a
 * project without canary sees no behavioral change (no regression).
 */
export function resolveReviewHooksWithCanary(
  config: SkillHooksConfigHolder | null | undefined,
  skillName: string,
  event: string,
  opts: { canaryPresent: boolean }
): NormalizedHook[] {
  const configured = resolveSkillHooks(config, skillName, event);

  // Canary defaults only attach to autopilot's review events; a different host
  // skill or a non-review event never gains canary detectors.
  if (skillName !== CANARY_REVIEW_HOST_SKILL) return configured;

  const canaryDefaults = resolveCanaryReviewHooks(opts.canaryPresent, event);
  if (canaryDefaults.length === 0) return configured;

  const configuredSkillNames = new Set(
    configured.filter((hook) => hook.type === 'skill').map((hook) => hook.skill)
  );
  const additions = canaryDefaults.filter(
    (hook) => hook.type === 'skill' && !configuredSkillNames.has(hook.skill)
  );
  return [...configured, ...additions];
}
