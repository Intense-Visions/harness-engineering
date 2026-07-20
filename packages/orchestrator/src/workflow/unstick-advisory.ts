import { z } from 'zod';

/**
 * Reasoner "unstick" advisory — escalate a STUCK local executor to the thinking model.
 *
 * When the local execution model (a non-thinking coder, e.g. qwen3-coder) fails the
 * enforced gate repeatedly, re-prompting the SAME session with the same failure does
 * not help — observed live (af7, #220): the coder could not fix a precisely-surfaced
 * `TS2532` across 7 self-correction retries. The cloud autopilot's answer to a stuck
 * task is escalation (stronger tier / an independent agent). The local analog, using
 * the models we already run: after a few failed self-corrections, ask the REASONER
 * (the thinking model used for design/plan/review, e.g. qwen3.6 with reasoning ON) to
 * diagnose the stuck state and prescribe a concrete fix, then hand THAT to the coder
 * as the next retry's guidance. A reasoner→coder handoff — the validated split — rather
 * than a bigger model or an isolated subagent (which a local staged run cannot spawn).
 *
 * This module is the pure core (gating + prompt + formatting); the orchestrator wires
 * the actual reasoner call via an `AnalysisProvider` and threads the result into the
 * existing gate-failure preamble.
 */

/** Structured shape the reasoner returns — a diagnosis + a concrete, actionable fix. */
export const UNSTICK_SCHEMA = z.object({
  diagnosis: z.string().describe('The likely ROOT CAUSE of the failure, in one or two sentences.'),
  fix: z
    .string()
    .describe(
      'A concrete, specific fix: the exact file(s), the change to make, and why it resolves the failure. Prefer a minimal surgical edit.'
    ),
});
export type UnstickAdvice = z.infer<typeof UNSTICK_SCHEMA>;

export const UNSTICK_SYSTEM_PROMPT =
  'You are a senior engineer helping an autonomous coding agent that is STUCK — it has failed the same quality gate several times and cannot fix it on its own. You are given the task, the diff it produced, and the exact gate failure. Diagnose the real root cause and prescribe a concrete, minimal fix (exact file + change). Be specific and terse. Do not restate the task or hedge; the coder will act directly on your `fix`.';

/**
 * How many consecutive gate failures before the reasoner is brought in. The coder gets
 * a few unaided self-corrections first (cheap, often enough); the reasoner escalation
 * is reserved for a genuine stall, and only while retry budget remains.
 */
export const DEFAULT_REASONER_ASSIST_AFTER = 3;

/**
 * Timeout floor for the reasoner advisory call. A thinking reasoner (e.g. qwen3.6 with
 * reasoning ON) produces its structured diagnosis MUCH slower than a quick SEL classify —
 * and over Ollama's `/v1` endpoint the thinking cannot be disabled, so the model reasons
 * for minutes before answering. The general `intelligence.requestTimeoutMs` (90s default)
 * kills it mid-think (observed live, af8: `reasoner unstick advisory skipped … "Request
 * timed out"`). Floor the advisory's timeout generously so it actually delivers; it only
 * fires on a genuine stall, so the occasional multi-minute wait is worth avoiding a
 * needs-human escalation.
 */
export const REASONER_UNSTICK_TIMEOUT_MS = 300_000;

/**
 * Gate: should this re-dispatch carry a reasoner advisory? True once the executor has
 * stalled (`attempts >= assistAfter`) but still has retry budget (`attempts < bound`),
 * and a reasoner backend is actually configured. Pure.
 */
export function shouldRequestUnstickAdvice(params: {
  attempts: number;
  bound: number;
  assistAfter: number;
  reasonerBackendName: string | undefined;
}): boolean {
  const { attempts, bound, assistAfter, reasonerBackendName } = params;
  if (reasonerBackendName === undefined || reasonerBackendName === '') return false;
  return attempts >= assistAfter && attempts < bound;
}

/** Build the reasoner's user prompt from the task, the diff so far, and the gate failure. */
export function buildUnstickPrompt(params: {
  taskText: string;
  gateReason: string;
  diffText: string;
}): string {
  const { taskText, gateReason, diffText } = params;
  const diffBlock =
    diffText.trim() === '' ? '(no diff captured)' : `<<<DIFF\n${diffText.trim()}\nDIFF>>>`;
  return [
    '## Task the coder is attempting',
    taskText.trim(),
    '',
    '## Diff the coder has produced so far',
    diffBlock,
    '',
    '## The exact gate failure it cannot get past',
    `<<<FAILURE\n${gateReason.trim()}\nFAILURE>>>`,
    '',
    'Diagnose the root cause and give the concrete fix.',
  ].join('\n');
}

/**
 * Render the reasoner's structured advice into the preamble prepended to the coder's
 * next-attempt gate-failure feedback. Fenced + labelled so the coder treats it as
 * senior guidance, not as part of the raw failure log.
 */
export function formatUnstickAdvisory(advice: UnstickAdvice): string {
  return [
    '## A senior engineer reviewed your repeated failure — follow this guidance',
    `**Root cause:** ${advice.diagnosis.trim()}`,
    `**Fix to apply:** ${advice.fix.trim()}`,
  ].join('\n');
}
