// packages/local-models/src/capability/harness-fit.ts
//
// The PURE scoring half of the harness-fit probe (D3). The agentic ranker composes a
// `buildQuality ∈ [0, 1]` multiplier into `agenticScore` (`ranker/agentic.ts`), but the
// benchmark + thin tool-calling probe can't tell an *acting* model from a *narrating*
// one: llama3.3:70b passes the tool-calling gate and is fast, yet it narrated (1 tool
// call, no artifact) while smaller models acted and converged. Only running the real
// harness surfaced that. This module turns a harness-fit probe RESULT into the
// `buildQuality` the ranker already knows how to consume — no ranker-math change (D1).
//
// Pure by construction: the I/O (a single dispatch through a backend + `runLocalWorkflowGate`
// judging convergence, reading the stream for act-vs-narrate metrics) lives in the injected
// `HarnessFitRunner` (Phase 2, in orchestrator/CLI), NEVER here — mirroring how
// `capability/agentic.ts` isolates its fetch. So `local-models` stays free of an orchestrator
// dependency. This file is deterministic, does no I/O, and never throws.
//
// The verdict is coarse (converged / acted-not-converged / narrated) plus act metrics,
// mapped to three bands (D6, Technical Design):
//   - converged   → HIGH (~0.9–1.0), scaled DOWN by retries-to-converge — but ONLY when
//                    the model actually produced an artifact (filesTouched>0). A
//                    converged-but-no-artifact result (e.g. a trivially-passing
//                    acceptanceCommand where the model did nothing) is SUSPECT and does
//                    NOT reach HIGH — it falls through to the acted/narrated bands below.
//   - acted       → MID  (~0.4–0.6): produced artifacts (filesTouched>0) OR multiple tool
//                    calls (toolCalls>=2), but the gate stayed red (or converged-without-file).
//   - narrated    → LOW  (~0.0–0.15): no artifact AND ≤1 tool call (the llama3.3:70b mode),
//                    including a converged-without-any-action result.
//   - error       → undefined (fail-open, D6): the ranker treats undefined as "no effect".
//
// @see docs/changes/harness-fit-probe/proposal.md (D1, D3, D6, SC1)

/**
 * The result of one harness-fit probe dispatch. Mirrors the spec's Technical Design.
 * The empirical source (a real single-dispatch judged by `runLocalWorkflowGate`) is the
 * injected runner's job (Phase 2); this module only READS the shape.
 */
export interface HarnessFitResult {
  /** Did the workflow gate pass within the probe's bounded attempts? The decisive signal. */
  converged: boolean;
  /** Number of tool calls the model emitted (from the recording stream's tool_execution count). */
  toolCalls: number;
  /** Number of files the model actually touched (artifact evidence from session_end stats). */
  filesTouched: number;
  /** Retries-to-converge — how many extra attempts the gate needed. 0 = converged first try. */
  retries: number;
  /** Tokens generated over the probe (optional; provenance only, not scored). */
  tokens?: number;
  /** Wall-clock duration of the probe in ms (optional; provenance only, not scored). */
  durationMs?: number;
  /** Populated on any probe failure/timeout/pull-error ⇒ buildQuality undefined (fail-open, D6). */
  error?: string;
}

/**
 * Named build-quality band constants — asserted by tests, documented, so the thresholds
 * are auditable in one place rather than scattered as magic numbers.
 */
export const BUILD_QUALITY = {
  /** Converged, best case (attempt 1): the ceiling of the HIGH band. */
  convergedCeil: 1.0,
  /** Converged floor — the score can never drop below this while the gate passed. */
  convergedFloor: 0.9,
  /**
   * Per-retry penalty subtracted from the converged ceiling. Chosen so the HIGH band
   * (`convergedCeil − retries × step`) only asymptotes toward `convergedFloor` and never
   * crosses it: the penalty is applied through a saturating curve, not a raw subtraction.
   */
  retryStep: 0.025,
  /** Acted-not-converged: the representative MID value (spec ~0.4–0.6). */
  midValue: 0.5,
  /** MID band floor (inclusive) — the lowest an "acted" verdict yields. */
  midFloor: 0.4,
  /** MID band ceiling (inclusive) — the highest an "acted" verdict yields. */
  midCeil: 0.6,
  /** Narrated: the representative LOW value (spec ~0.0–0.15). */
  lowValue: 0.1,
  /** LOW band floor (inclusive). */
  lowFloor: 0.0,
  /** LOW band ceiling (inclusive). */
  lowCeil: 0.15,
} as const;

/**
 * The act-vs-narrate boundary on tool calls: a single tool call with no artifact is
 * "narration" (the model described a step but didn't drive the loop); TWO OR MORE tool
 * calls counts as having ACTED even without a file touch.
 */
const ACTED_TOOL_CALL_THRESHOLD = 2;

/**
 * Map a harness-fit probe result to a `buildQuality ∈ [0, 1]`, or `undefined` when the
 * probe errored (fail-open — the ranker treats `undefined` as "no effect", D6).
 *
 * Coarse three-band verdict (Technical Design):
 *   - `error` present                     → `undefined`.
 *   - converged AND filesTouched>0        → HIGH, scaled DOWN by `retries` but never below the floor.
 *   - converged-without-artifact          → SUSPECT: fall through to the acted/narrated bands.
 *   - acted (files OR ≥2 calls)           → MID.
 *   - narrated (no file, ≤1 call)         → LOW.
 *
 * Pure and deterministic; never throws.
 */
export function scoreBuildQuality(result: HarnessFitResult): number | undefined {
  // D6 — a failed probe is fail-open: no signal, no ranking effect.
  if (result.error !== undefined) return undefined;

  // Converged ⇒ HIGH band, BUT ONLY if the model actually produced an artifact. A
  // converged-but-no-file result is suspect (e.g. a trivially-passing acceptanceCommand
  // where the model narrated instead of building) and must NOT score HIGH — it falls
  // through to the acted/narrated bands below. Scale the ceiling down by retries-to-
  // converge through a saturating curve so more retries → strictly lower, but the score
  // asymptotes toward the floor and never leaves the HIGH band (converged is "good enough").
  if (result.converged && result.filesTouched > 0) {
    const retries = Math.max(0, result.retries);
    const span = BUILD_QUALITY.convergedCeil - BUILD_QUALITY.convergedFloor;
    // 1 − e^(−k·retries) ∈ [0, 1) grows with retries and saturates at 1, so the applied
    // penalty stays within `span` and the result stays within (floor, ceil].
    const decay = 1 - Math.exp(-BUILD_QUALITY.retryStep * retries);
    return BUILD_QUALITY.convergedCeil - span * decay;
  }

  // Not HIGH (didn't converge, or converged without touching a file). Did it ACT
  // (artifacts or repeated tool use) or merely NARRATE?
  const acted = result.filesTouched > 0 || result.toolCalls >= ACTED_TOOL_CALL_THRESHOLD;
  return acted ? BUILD_QUALITY.midValue : BUILD_QUALITY.lowValue;
}

// --- The injection seam (D3): interface + portable task schema, NO I/O -------
//
// `local-models` OWNS the pure parts — the `buildQuality` mapping above, the
// `HarnessFitRunner` INTERFACE, and the adopter-portable task-suite schema. The
// actual runner (a single dispatch through a backend + a workspace + an
// acceptance gate, reading the recording stream for act-vs-narrate metrics)
// is IMPLEMENTED in `orchestrator`/CLI and INJECTED at the composition root.
// So `local-models` never imports `orchestrator` — the dependency points one
// way (orchestrator → local-models), mirroring `capability/agentic.ts`'s
// injected `fetchImpl`.
//
// @see docs/changes/harness-fit-probe/proposal.md (D3, D4, SC5)

/**
 * One self-describing, adopter-portable harness-fit probe task (D4). Each task
 * carries everything a throwaway workspace needs to run it — no host-repo layout
 * is hardcoded, so a probe runs in any adopter project, not just this monorepo.
 */
export interface HarnessFitProbeTask {
  /** Stable identifier for the task (used for logging/caching). */
  id: string;
  /** The prompt handed to the candidate model in the throwaway workspace. */
  prompt: string;
  /**
   * Files to seed into the throwaway workspace before the dispatch, keyed by
   * WORKSPACE-RELATIVE path → file content. Optional: a task may start empty and
   * ask the model to create everything. Never absolute — a probe seeds a temp dir.
   */
  files?: Record<string, string>;
  /**
   * The acceptance/convergence command, run in the workspace AFTER the dispatch.
   * Exit 0 ⇒ converged. Self-contained + generic (e.g. `node --test` on a seeded
   * test file) so it runs anywhere without the adopter's build graph.
   */
  acceptanceCommand: string;
}

/**
 * The INJECTION SEAM. `local-models` defines this interface and depends only on
 * it; the orchestrator/CLI provides the concrete impl (single dispatch through an
 * `OllamaBackend` + workspace + acceptance gate). A null/throwing/absent runner
 * ⇒ `buildQuality` undefined ⇒ "no effect" (fail-open, D6).
 */
export interface HarnessFitRunner {
  /**
   * Run ONE contained probe of `model` against `task` in a throwaway workspace
   * and return the coarse verdict + act metrics. FULLY GUARDED by the impl: any
   * failure (model won't load, timeout, workspace error) resolves to a
   * `HarnessFitResult` carrying `error`, never a rejected promise.
   */
  runProbe(model: string, task: HarnessFitProbeTask): Promise<HarnessFitResult>;
}

/**
 * The default, adopter-portable probe suite (D4). Small (2–3 tasks), fully
 * self-contained, and free of any `@harness-engineering/*` / monorepo-layout
 * specifics so it runs against a throwaway workspace in ANY project. Operators
 * may override the suite; these are the shipped defaults.
 *
 * Each task seeds only Node's built-in `node:test` + `node:assert` so the
 * acceptance command needs nothing but a Node runtime (no install, no build):
 *   1. `pure-fn` — write a pure `add(a, b)` that satisfies a seeded test.
 *   2. `bugfix`  — fix an off-by-one in a seeded `clamp` so its test passes.
 */
export const DEFAULT_HARNESS_FIT_TASKS: readonly HarnessFitProbeTask[] = [
  {
    id: 'pure-fn',
    prompt: [
      'Implement the `add` function in `add.js` so that it returns the sum of its',
      'two numeric arguments. A test file `add.test.js` already exists and must',
      'pass unchanged. Create or edit `add.js` only. Do not modify the test.',
    ].join(' '),
    files: {
      'add.js': [
        '// TODO: implement `add` so that add(a, b) returns a + b.',
        'export function add(a, b) {',
        '  throw new Error("not implemented");',
        '}',
        '',
      ].join('\n'),
      'add.test.js': [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { add } from './add.js';",
        '',
        "test('adds two numbers', () => {",
        '  assert.equal(add(2, 3), 5);',
        '  assert.equal(add(-1, 1), 0);',
        '  assert.equal(add(0, 0), 0);',
        '});',
        '',
      ].join('\n'),
    },
    acceptanceCommand: 'node --test add.test.js',
  },
  {
    id: 'bugfix',
    prompt: [
      'The `clamp` function in `clamp.js` has an off-by-one bug: it uses strict',
      'comparisons where it should be inclusive, so boundary values are clamped',
      'incorrectly. Fix `clamp.js` so the seeded test `clamp.test.js` passes.',
      'Edit `clamp.js` only. Do not modify the test.',
    ].join(' '),
    files: {
      'clamp.js': [
        '// clamp(value, min, max) should return value bounded to [min, max].',
        '// BUG: the boundary comparisons are exclusive, so value === min / max',
        '// gets pushed one past the edge.',
        'export function clamp(value, min, max) {',
        '  if (value < min) return min + 1;',
        '  if (value > max) return max - 1;',
        '  return value;',
        '}',
        '',
      ].join('\n'),
      'clamp.test.js': [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { clamp } from './clamp.js';",
        '',
        "test('clamps within inclusive bounds', () => {",
        '  assert.equal(clamp(5, 0, 10), 5);',
        '  assert.equal(clamp(-3, 0, 10), 0);',
        '  assert.equal(clamp(42, 0, 10), 10);',
        '  assert.equal(clamp(0, 0, 10), 0);',
        '  assert.equal(clamp(10, 0, 10), 10);',
        '});',
        '',
      ].join('\n'),
    },
    acceptanceCommand: 'node --test clamp.test.js',
  },
];
