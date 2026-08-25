// packages/core/src/hooks/skill-lifecycle.ts
//
// Cross-skill lifecycle hook framework (the shared seam behind `skillHooks`).
//
// A project attaches ADDITIONAL work at lifecycle points of ANY hook-supporting
// orchestrator skill via a top-level `skillHooks` block in harness.config.json:
//
//   "skillHooks": {
//     "harness-autopilot": {
//       "before:EXECUTE": [
//         "preflight-skill",
//         { "type": "command", "run": "pnpm lint", "blocking": true },
//         { "type": "prompt", "text": "Prefer existing helpers in packages/core/util." }
//       ],
//       "after:REVIEW":       [ { "type": "skill", "skill": "canary-cassandra", "blocking": true } ],
//       "after:FINAL_REVIEW": [ "canary-cassandra" ],
//       "on:failure":         [ { "type": "command", "run": "scripts/notify.sh" } ]
//     },
//     "harness-code-review": { "after:mechanical": ["extra-domain-check"] }
//   }
//
// - Outer key  = the hook-supporting skill's name.
// - Inner key  = an event string. Grammar: `^(before|after|on):[A-Za-z0-9_-]+$`.
//     * `before:<phase>` / `after:<phase>` — phase-boundary hooks (multi-phase skills).
//     * `before:run` / `after:run`         — whole-invocation boundary (single-shot skills too).
//     * `on:<event>`                       — cross-cutting lifecycle events (`on:failure`,
//                                            `on:park`, `on:checkpoint`, `on:retry`, ...).
//   Each skill DECLARES its own event vocabulary in its SKILL.md — there is no
//   universal phase enum, so hooks are keyed by skill name and the skill's own
//   event strings.
// - Value      = an array of hook ENTRIES, each of one of three kinds (below).
//
// RESERVED (v2, not implemented here — see SKILL.md / configuration.md):
//   - per-iteration granularity (`after:EXECUTE:task`, `after:dispatch:item`)
//   - a `"*"` wildcard outer key meaning "hooks for every skill".
//
// This module is pure and IO-free: it only NORMALIZES and RESOLVES configured
// hooks. Dispatch (running a subagent, running a command, appending prompt text)
// and the hard-halt/blocking policy enforcement live in the consuming skills.

/**
 * A single configured hook entry, as it appears in `harness.config.json`.
 *
 * A bare string is shorthand for a `skill` entry. Object entries are
 * discriminated on `type`; a typeless object carrying a `skill` field is
 * tolerated as legacy shorthand and normalized to a `skill` entry.
 *
 * Every OBJECT entry may carry `enabled` (default `true`). A `enabled: false`
 * entry is skipped entirely at resolution — a project can park a hook without
 * deleting it. Skipping a disabled hook is never a hard halt.
 */
export type SkillHookEntry =
  | string
  | { type: 'skill'; skill: string; blocking?: boolean; enabled?: boolean }
  | { type: 'prompt'; text: string; enabled?: boolean }
  | { type: 'command'; run: string; blocking?: boolean; enabled?: boolean }
  /** Legacy / typeless shorthand — normalized to a `skill` entry. */
  | { skill: string; blocking?: boolean; enabled?: boolean };

/** Per-skill map of event string -> ordered hook entries. */
export type SkillHooksForSkill = Record<string, SkillHookEntry[]>;

/** Top-level `skillHooks` config: skill name -> its event map. */
export type SkillHooksConfig = Record<string, SkillHooksForSkill>;

/** Minimal shape the resolver reads from a harness config. */
export interface SkillHooksConfigHolder {
  skillHooks?: SkillHooksConfig;
}

/**
 * A normalized hook, ready for a consuming skill to act on. A tagged union on
 * `type` mirroring the three entry kinds:
 *
 * - `skill`   — dispatch as an additional subagent (LLM path).
 * - `prompt`  — mechanically APPEND `text` to the phase's persona prompt/context;
 *               runs no process, never blocks, never halts.
 * - `command` — mechanically RUN `run` via the command-runner; captures exit code
 *               + stdout/stderr. A command that RAN and exited non-zero is a
 *               finding (blocking per policy); a command that CANNOT be spawned is
 *               a hard halt (same class as an unresolvable skill).
 */
export type NormalizedHook =
  | { type: 'skill'; skill: string; blocking: boolean }
  | { type: 'prompt'; text: string }
  | { type: 'command'; run: string; blocking: boolean };

/** Event-key grammar: `before:<name>`, `after:<name>`, or `on:<name>`. */
export const SKILL_HOOK_EVENT_KEY_RE = /^(before|after|on):[A-Za-z0-9_-]+$/;

/**
 * Default blocking policy for `skill` and `command` hooks when a per-entry
 * `blocking` is not set. Events whose state names a review/verify moment default
 * to `blocking: true` (a domain reviewer or verify command that surfaces a
 * problem should block, matching the built-in review/verify gates); every other
 * event defaults to `blocking: false` (advisory). A per-entry `blocking` always
 * overrides this. `prompt` hooks ignore blocking entirely (they never block).
 */
export function defaultBlocking(event: string): boolean {
  const state = event.includes(':') ? event.slice(event.indexOf(':') + 1) : event;
  return /review|verify/i.test(state);
}

/** Resolve a hook's blocking flag: the per-entry override, else the event policy. */
function resolveBlocking(entry: { blocking?: boolean }, event: string): boolean {
  return entry.blocking ?? defaultBlocking(event);
}

function normalizeEntry(entry: SkillHookEntry, event: string): NormalizedHook {
  // Bare string -> skill shorthand.
  if (typeof entry === 'string') {
    return { type: 'skill', skill: entry, blocking: defaultBlocking(event) };
  }

  const obj = entry as {
    type?: 'skill' | 'prompt' | 'command';
    skill?: string;
    text?: string;
    run?: string;
    blocking?: boolean;
  };

  // Prompt: purely declarative text injection; never blocks.
  if (obj.type === 'prompt') {
    return { type: 'prompt', text: obj.text as string };
  }

  // Command: mechanical execution.
  if (obj.type === 'command') {
    return { type: 'command', run: obj.run as string, blocking: resolveBlocking(obj, event) };
  }

  // Explicit `skill`, OR a typeless object carrying `skill` (legacy shorthand):
  // default `type: "skill"` when a `skill` field is present.
  return { type: 'skill', skill: obj.skill as string, blocking: resolveBlocking(obj, event) };
}

/**
 * Resolve the ordered, normalized hooks a project has attached to
 * `skillName` at `event`. Returns `[]` when the config, the skill's entry, or
 * the event's entry is absent — so a skill that always calls this is a no-op
 * unless a project opts in.
 *
 * String entries are normalized to `skill` hooks; object entries keep their
 * kind; blocking is resolved from the per-entry value or {@link defaultBlocking}.
 * Order is preserved exactly as declared.
 */
export function resolveSkillHooks(
  config: SkillHooksConfigHolder | null | undefined,
  skillName: string,
  event: string
): NormalizedHook[] {
  const entries = config?.skillHooks?.[skillName]?.[event];
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.filter(isEnabled).map((entry) => normalizeEntry(entry, event));
}

/** A bare string is always enabled; an object entry honors `enabled` (default true). */
function isEnabled(entry: SkillHookEntry): boolean {
  if (typeof entry === 'string') return true;
  return (entry as { enabled?: boolean }).enabled !== false;
}
