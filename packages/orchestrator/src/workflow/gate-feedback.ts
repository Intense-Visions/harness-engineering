/**
 * Gate-failure feedback distillation.
 *
 * When a local staged unit is blocked by the enforced gate (typecheck / lint /
 * test), the failure output is threaded into the NEXT retry's prompt so the model
 * can fix it (per-phase retry feedback, #931). The naive approach — a head+tail
 * slice ({@link truncateGateOutput}) — is actively harmful for a modern test
 * runner: with many test files, the *head* is consumed by the passing-file tree
 * and the *tail* by the summary counts, so the one thing the model actually needs
 * — the failing tests' `Expected`/`Received` assertion diffs, which sit in the
 * MIDDLE — is exactly what gets dropped. Observed live (af6, #220): the model
 * reached 264/267 passing and could not close 3 specific failures across 7 gated
 * retries because it never saw *why* they failed, only their names.
 *
 * {@link distillGateFailure} instead extracts the failure-relevant regions —
 * tsc `error TS…` lines, per-test failure markers and their following assertion
 * diffs, lint `error` rows — plus the trailing summary, dropping the passing
 * noise. It is framework-general (tsc / eslint / vitest / jest) and degrades
 * gracefully: output with no recognizable failure markers falls back to the
 * head+tail behavior, and small output is returned verbatim.
 */

/**
 * Truncate captured gate output to a bounded size for the re-dispatch prompt
 * preamble (a full typecheck/test log can be enormous). Keeps the head + tail
 * so both the first error and the summary survive. Kept as the fallback for
 * output {@link distillGateFailure} cannot recognize.
 */
export function truncateGateOutput(output: string, max = 4000): string {
  const trimmed = output.trim();
  if (trimmed.length <= max) return trimmed;
  const head = trimmed.slice(0, Math.floor(max * 0.7));
  const tail = trimmed.slice(-Math.floor(max * 0.3));
  return `${head}\n… [truncated ${trimmed.length - max} chars] …\n${tail}`;
}

/**
 * Lines that signal the START of a failure region worth keeping. Framework-general;
 * kept deliberately broad because a missed failure region is worse (blind retry)
 * than an extra kept region. Matched per-line, case-sensitive where the tool's
 * own output is (tsc `error TS`, vitest `×`).
 */
const FAILURE_MARKERS: RegExp[] = [
  /\berror TS\d+/, // tsc
  /^\s*[×✗]\s/, // vitest/jest failed test
  /\bFAIL\b/, // vitest/jest failed file header
  /AssertionError/,
  /^\s*[-+]?\s*(Expected|Received)\b/, // assertion diff labels
  /\bexpected\b.*\breceived\b/i,
  /⎯+\s*Failed/, // vitest "Failed Tests" divider
  /^\s+\d+:\d+\s+error\s+\S/, // eslint "  12:5  error  msg  rule"
];

/** Number of lines to keep AFTER a failure marker (assertion diffs follow it). */
const CONTEXT_AFTER = 15;
/** Number of lines to keep BEFORE a failure marker (the test title / file). */
const CONTEXT_BEFORE = 1;
/** Trailing lines always kept (the summary: "Tests 3 failed | 264 passed"). */
const SUMMARY_LINES = 6;

function isFailureLine(line: string): boolean {
  return FAILURE_MARKERS.some((re) => re.test(line));
}

/**
 * Distill gate (typecheck/lint/test) output down to the failure-relevant regions
 * plus the trailing summary, bounded to `max` chars. Prioritizes actionable
 * failure detail (assertion diffs, tsc errors) over the passing noise a head+tail
 * slice would keep. Falls back to {@link truncateGateOutput} when the output has
 * no recognizable failure markers (e.g. a non-test acceptance command).
 *
 * The trailing summary is always preserved (its budget is reserved first), so the
 * model sees both the specific failures AND the "N failed | M passed" tally even
 * when the failure detail itself has to be truncated.
 *
 * Pure and total — never throws.
 */
export function distillGateFailure(output: string, max = 6000): string {
  const trimmed = output.trim();
  if (trimmed.length <= max) return trimmed;

  const lines = trimmed.split('\n');
  const failureIdx: number[] = [];
  // Restrict failure windows to the region ABOVE the reserved summary tail so a
  // window can't collide with the always-kept summary.
  const summaryStart = Math.max(0, lines.length - SUMMARY_LINES);
  for (let i = 0; i < summaryStart; i++) {
    if (isFailureLine(lines[i] ?? '')) failureIdx.push(i);
  }

  // No recognizable failure structure → preserve the prior head+tail behavior.
  if (failureIdx.length === 0) return truncateGateOutput(trimmed, max);

  // Reserve the summary tail first; failure detail fills whatever remains.
  const summary = lines.slice(summaryStart).join('\n').trimEnd();
  const detailBudget = Math.max(0, max - summary.length - 64);

  // Mark the failure-context lines to keep (a window around each failure line).
  const keep: boolean[] = new Array<boolean>(summaryStart).fill(false);
  for (const idx of failureIdx) {
    const start = Math.max(0, idx - CONTEXT_BEFORE);
    const end = Math.min(summaryStart - 1, idx + CONTEXT_AFTER);
    for (let i = start; i <= end; i++) keep[i] = true;
  }

  // Emit kept lines in order, collapsing skipped spans to a marker, stopping once
  // the detail budget is exhausted (keeping earliest failures — usually the root
  // cause; later ones often cascade).
  const out: string[] = [];
  let used = 0;
  let gap = false;
  for (let i = 0; i < summaryStart; i++) {
    if (keep[i] !== true) {
      gap = true;
      continue;
    }
    if (gap) out.push('… …');
    gap = false;
    const line = lines[i] ?? '';
    if (used + line.length + 1 > detailBudget) {
      out.push('… [further failure output truncated] …');
      break;
    }
    out.push(line);
    used += line.length + 1;
  }
  out.push('… …', summary);
  return out.join('\n');
}
