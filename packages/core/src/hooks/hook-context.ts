// packages/core/src/hooks/hook-context.ts
//
// Hook INPUT-CONTEXT contract. When a hook-supporting skill fires a hook, it
// passes the invocation context so the hook is not blind:
//
//   - `command` kind: context is passed BOTH as environment variables
//     (portable, language-agnostic — see the HARNESS_* table below) AND as a
//     JSON object on STDIN for structured consumers.
//   - `skill`   kind: the dispatched subagent's brief includes the same context
//     the built-in persona/reviewer gets (event, session dir, changed files,
//     plan path) — see {@link buildHookBriefLines}.
//   - `prompt`  kind: static text in v1 (no templating). `{{token}}` templating
//     is RESERVED for v2.
//
// Env-var contract (documented once, here — mirrored in configuration.md):
//   HARNESS_HOOK_EVENT      the event key, e.g. `after:REVIEW`
//   HARNESS_HOOK_SKILL      the host skill, e.g. `harness-autopilot`
//   HARNESS_PHASE           the current phase/state, when known
//   HARNESS_PROJECT_ROOT    absolute project root
//   HARNESS_SESSION_DIR     the autopilot/session directory, when known
//   HARNESS_CHANGED_FILES   newline-separated list of changed files
//   HARNESS_PLAN_PATH       the active plan path, when known
//   HARNESS_FAILURE_REASON  set only on `on:failure`
//
// Absent values produce an UNSET env key (never an empty-string placeholder).

/** The invocation context a host skill threads to each hook it fires. */
export interface HookContext {
  /** The event key that fired, e.g. `after:REVIEW`. */
  event: string;
  /** The host (hook-supporting) skill, e.g. `harness-autopilot`. */
  hostSkill: string;
  /** Current phase/state, when the host skill is phase-based. */
  phase?: string;
  /** Absolute project root. */
  projectRoot?: string;
  /** Session/scratch directory for this run, when known. */
  sessionDir?: string;
  /** Changed files in scope for this hook point. */
  changedFiles?: string[];
  /** Active plan path, when known. */
  planPath?: string;
  /** Failure reason — set only for `on:failure` hooks. */
  failureReason?: string;
}

/**
 * Build the `HARNESS_*` environment map for a `command` hook. Only keys with a
 * defined value are included — absent context fields are simply not set, so a
 * consumer sees an unset variable rather than empty-string garbage.
 */
export function buildHookEnv(context: HookContext): Record<string, string> {
  const env: Record<string, string> = {
    HARNESS_HOOK_EVENT: context.event,
    HARNESS_HOOK_SKILL: context.hostSkill,
  };
  if (context.phase) env.HARNESS_PHASE = context.phase;
  if (context.projectRoot) env.HARNESS_PROJECT_ROOT = context.projectRoot;
  if (context.sessionDir) env.HARNESS_SESSION_DIR = context.sessionDir;
  if (context.changedFiles && context.changedFiles.length > 0) {
    env.HARNESS_CHANGED_FILES = context.changedFiles.join('\n');
  }
  if (context.planPath) env.HARNESS_PLAN_PATH = context.planPath;
  if (context.failureReason) env.HARNESS_FAILURE_REASON = context.failureReason;
  return env;
}

/**
 * The structured JSON payload piped to a `command` hook's STDIN. Mirrors the
 * env contract in camelCase; omits absent fields.
 */
export function buildHookStdinPayload(context: HookContext): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event: context.event,
    hostSkill: context.hostSkill,
  };
  if (context.phase) payload.phase = context.phase;
  if (context.projectRoot) payload.projectRoot = context.projectRoot;
  if (context.sessionDir) payload.sessionDir = context.sessionDir;
  if (context.changedFiles && context.changedFiles.length > 0) {
    payload.changedFiles = context.changedFiles;
  }
  if (context.planPath) payload.planPath = context.planPath;
  if (context.failureReason) payload.failureReason = context.failureReason;
  return payload;
}

/**
 * Human-readable context lines to embed in a `skill` hook's subagent brief, so a
 * hooked reviewer receives the same context the built-in reviewer does. Absent
 * fields are omitted.
 */
export function buildHookBriefLines(context: HookContext): string[] {
  const lines = [`Event: ${context.event}`, `Host skill: ${context.hostSkill}`];
  if (context.phase) lines.push(`Phase: ${context.phase}`);
  if (context.sessionDir) lines.push(`Session dir: ${context.sessionDir}`);
  if (context.planPath) lines.push(`Plan: ${context.planPath}`);
  if (context.changedFiles && context.changedFiles.length > 0) {
    lines.push(`Changed files:\n${context.changedFiles.map((f) => `  - ${f}`).join('\n')}`);
  }
  if (context.failureReason) lines.push(`Failure reason: ${context.failureReason}`);
  return lines;
}
