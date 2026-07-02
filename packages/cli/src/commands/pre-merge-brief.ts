import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { CiReviewResult, DiffInfo } from '@harness-engineering/core';
import { gatherSignals } from '@harness-engineering/signals';
import type { SignalResult, SignalsResult } from '@harness-engineering/signals';
import type { OutcomeVerdict } from '@harness-engineering/intelligence';

/** Hidden HTML marker used to find + upsert the sticky comment. */
export const BRIEF_MARKER = '<!-- harness:pre-merge-brief -->';

/** All inputs are OPTIONAL; a missing input degrades to an "unavailable" line. */
export interface BriefInputs {
  /** Diff summary; undefined when the range produced no diff / could not resolve. */
  diff?: DiffInfo | undefined;
  /** review-ci JSON verdict, from `--from`; undefined when absent. */
  review?: CiReviewResult['verdict'] | undefined;
  /** Fresh signal snapshot; empty/undefined when signals could not be gathered. */
  signals?: SignalResult[] | undefined;
  /** Outcome-eval verdict for the head commit; undefined = "not yet evaluated". */
  outcome?: OutcomeVerdict | undefined;
}

/** Standard degradation line for an input that could not be gathered. */
const UNAVAILABLE = '> _unavailable / not configured._';

/**
 * Render the diff-summary section. Degrades to an "unavailable" line when no
 * diff could be resolved (empty range, git failure, etc.).
 */
function renderDiffSummary(diff?: DiffInfo): string[] {
  const out: string[] = ['## Diff summary', ''];
  if (!diff) {
    out.push(UNAVAILABLE);
    return out;
  }
  out.push(
    `**Files changed:** ${diff.changedFiles.length}` +
      ` (new: ${diff.newFiles.length}, deleted: ${diff.deletedFiles.length})` +
      `  •  **Diff lines:** ${diff.totalDiffLines}`
  );
  return out;
}

/** A single validated finding as it appears on the verdict. */
type ReviewFindingView = NonNullable<CiReviewResult['verdict']['findings']>[number];

/** Render a finding as a one-line Markdown bullet: severity, location, title. */
function findingLine(f: ReviewFindingView): string {
  const loc = f.lineRange ? `${f.file}:${f.lineRange[0]}` : f.file;
  return `- \`${f.severity}\` **${loc}** — ${f.title}`;
}

/**
 * Render the review-verdict section. Degrades to an "unavailable" line when no
 * `--from` verdict was supplied.
 */
function renderReviewVerdict(verdict?: CiReviewResult['verdict']): string[] {
  const out: string[] = ['## Review verdict', ''];
  if (!verdict) {
    out.push(UNAVAILABLE);
    return out;
  }
  const findings = verdict.findings ?? [];
  const blocking = verdict.blockingFindings ?? [];
  out.push(
    `**Assessment:** \`${verdict.assessment}\`  •  **Runner:** \`${verdict.runner}\`` +
      `  •  **Findings:** ${findings.length} (blocking: ${blocking.length})`
  );
  if (verdict.skipped) {
    out.push('', `> ⚠️ ${verdict.skipReason ?? 'A review tier was skipped.'}`);
  }
  if (blocking.length) out.push('', '### Blocking', ...blocking.map(findingLine));
  const nonBlocking = findings.filter((f) => !blocking.some((b) => b.id === f.id));
  if (nonBlocking.length) out.push('', '### Other findings', ...nonBlocking.map(findingLine));
  return out;
}

/** Render a single signal as a one-line Markdown bullet: status, label, value. */
function signalLine(s: SignalResult): string {
  const value = s.value === null ? '—' : `${s.value}${s.unit ?? ''}`;
  return `- \`${s.status}\` **${s.label}** — ${value}`;
}

/**
 * Render the **Signal status** section. The heading literal is exactly
 * `Signal status` (a point-in-time snapshot, NOT deltas). Degrades to an
 * "unavailable" line when the snapshot is empty/undefined.
 */
function renderSignalStatus(signals?: SignalResult[]): string[] {
  const out: string[] = ['## Signal status', ''];
  if (!signals || signals.length === 0) {
    out.push(UNAVAILABLE);
    return out;
  }
  out.push(...signals.map(signalLine));
  return out;
}

/**
 * Render the outcome-eval section. Pre-merge the `execution_outcome` node is
 * commonly ABSENT, so an undefined verdict degrades to "not yet evaluated"
 * (never an error).
 */
function renderOutcomeEval(outcome?: OutcomeVerdict): string[] {
  const out: string[] = ['## Outcome evaluation', ''];
  if (!outcome) {
    out.push('> _not yet evaluated._');
    return out;
  }
  out.push(
    `**Verdict:** \`${outcome.verdict}\`  •  **Confidence:** \`${outcome.confidence}\`` +
      `  •  **Authority:** \`${outcome.authority}\``,
    '',
    outcome.rationale
  );
  return out;
}

/**
 * Derive the **"👀 Worth your eyes"** section: EXACTLY the union of (a) review
 * blocking findings, (b) signals with status `warn` or `alert`, and (c) unmet
 * outcome criteria — no more, no fewer. Renders "nothing flagged" when the
 * union is empty.
 */
function deriveWorthYourEyes(inputs: BriefInputs): string[] {
  const out: string[] = ['## 👀 Worth your eyes', ''];
  const blocking = inputs.review?.blockingFindings ?? [];
  const flaggedSignals = (inputs.signals ?? []).filter(
    (s) => s.status === 'warn' || s.status === 'alert'
  );
  const unmet = inputs.outcome?.unmetCriteria ?? [];

  const bullets: string[] = [
    ...blocking.map((f) => `- 🛑 ${findingLine(f).replace(/^- /, '')}`),
    ...flaggedSignals.map((s) => `- 📊 ${signalLine(s).replace(/^- /, '')}`),
    ...unmet.map((c) => `- 🎯 ${c}`),
  ];

  if (bullets.length === 0) {
    out.push('_Nothing flagged — no blocking findings, no warn/alert signals, no unmet criteria._');
    return out;
  }
  out.push(...bullets);
  return out;
}

/**
 * Pure Markdown render (no I/O, no process.exit). Assembles the brief section by
 * section, in the order required by the spec: header, diff summary, review
 * verdict, Signal status, outcome-eval, "worth your eyes".
 */
export function buildBriefBody(inputs: BriefInputs): string {
  const lines: string[] = [
    BRIEF_MARKER,
    '# 🧭 Pre-merge brief',
    '',
    ...renderDiffSummary(inputs.diff),
    '',
    ...renderReviewVerdict(inputs.review),
    '',
    ...renderSignalStatus(inputs.signals),
    '',
    ...renderOutcomeEval(inputs.outcome),
    '',
    ...deriveWorthYourEyes(inputs),
  ];
  return lines.join('\n');
}

/** Seam for delivering the brief to a PR — real impl shells out to `gh`. */
export type PostBrief = (body: string) => void;

/** The minimal comment shape the upsert logic needs: an id and a body. */
export interface MarkedComment {
  id: number;
  body: string;
}

/**
 * Pure sticky-upsert core: find the comment carrying {@link BRIEF_MARKER} and
 * PATCH it in place; otherwise post a new one. This is the single decision point
 * the fake test drives — the real `gh` calls live only in {@link defaultPostBrief}.
 */
export function upsertComment(
  comments: MarkedComment[],
  body: string,
  patch: (id: number, body: string) => void,
  post: (body: string) => void
): void {
  const marked = comments.find((c) => c.body.includes(BRIEF_MARKER));
  if (marked) {
    patch(marked.id, body);
  } else {
    post(body);
  }
}

/**
 * Default poster: upsert the brief as a single sticky PR comment via `gh`.
 *
 * Lists the current PR's comments (`gh pr view --json comments`), finds the one
 * carrying {@link BRIEF_MARKER}, and either PATCHes it in place
 * (`gh api ... -X PATCH`) or posts a fresh one (`gh pr comment --body-file -`,
 * piping the body via stdin so a long brief never hits the shell arg-length
 * limit). Contains NO `process.exit`; the caller owns exit codes.
 */
export const defaultPostBrief: PostBrief = (body) => {
  const raw = execFileSync('gh', ['pr', 'view', '--json', 'comments'], {
    encoding: 'utf-8',
  }).toString();
  const parsed = JSON.parse(raw) as {
    comments?: Array<{ id?: number; url?: string; body?: string }>;
  };
  const comments: MarkedComment[] = (parsed.comments ?? [])
    .filter(
      (c): c is { id: number; body: string } =>
        typeof c.id === 'number' && typeof c.body === 'string'
    )
    .map((c) => ({ id: c.id, body: c.body }));

  upsertComment(
    comments,
    body,
    (id, patchBody) => {
      // PATCH the existing comment in place via the REST API.
      execFileSync(
        'gh',
        [
          'api',
          '-X',
          'PATCH',
          `/repos/{owner}/{repo}/issues/comments/${id}`,
          '-f',
          `body=${patchBody}`,
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' }
      );
    },
    (postBody) => {
      execFileSync('gh', ['pr', 'comment', '--body-file', '-'], {
        input: postBody,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
    }
  );
};

// ── Input readers ────────────────────────────────────────────────────────────
// Each reader owns its failure mode and degrades to the "unavailable" value so a
// missing/broken input never aborts the brief (exit 0 is preserved). No I/O in
// these bodies beyond the injected seams, and no `process.exit`.

/** Injected file-read seam. Real impl reads UTF-8 from disk. */
export type ReadFile = (path: string) => string;

const defaultReadFile: ReadFile = (path) => readFileSync(path, 'utf-8');

/**
 * Read + `JSON.parse` a `review-ci --json` artifact and return its verdict.
 * Returns `undefined` (never throws) when `path` is undefined or the read/parse
 * fails — the review section then renders "unavailable".
 */
export function readReview(
  path: string | undefined,
  readFile: ReadFile = defaultReadFile
): CiReviewResult['verdict'] | undefined {
  if (!path) return undefined;
  try {
    const parsed = JSON.parse(readFile(path)) as CiReviewResult;
    return parsed.verdict;
  } catch {
    return undefined;
  }
}

/** Injected signals-gather seam. Defaults to the real `gatherSignals`. */
export type GatherSignals = (projectPath: string) => Promise<SignalsResult>;

/**
 * Gather a fresh signal snapshot, degrading to `[]` (never throwing) when the
 * gather rejects — the Signal-status section then renders "unavailable".
 */
export async function gatherSignalsSafe(
  projectPath: string,
  gather: GatherSignals = gatherSignals
): Promise<SignalResult[]> {
  try {
    const result = await gather(projectPath);
    return result.signals;
  } catch {
    return [];
  }
}

/** The minimal graph-store surface the outcome lookup needs. */
export interface OutcomeStore {
  findNodes(query: { type: string }): Array<{ metadata: Record<string, unknown> }>;
}

/**
 * Best-effort lookup of the `execution_outcome` verdict for `headSha`.
 *
 * `ExecutionOutcome` carries no guaranteed sha, so we match on a
 * `metadata.commit` / `metadata.headSha` field when present. Pre-merge the node
 * is commonly ABSENT (or unmatched) — the common case — so this returns
 * `undefined` (→ "not yet evaluated") when there is no store, no `headSha`, or
 * no matching node. Never throws.
 */
export function findOutcomeVerdict(
  store: OutcomeStore | undefined,
  headSha: string | undefined
): OutcomeVerdict | undefined {
  if (!store || !headSha) return undefined;
  try {
    const nodes = store.findNodes({ type: 'execution_outcome' });
    const match = nodes.find((n) => {
      const m = n.metadata ?? {};
      return m.commit === headSha || m.headSha === headSha;
    });
    if (!match) return undefined;
    const m = match.metadata;
    // Map the node's metadata to the OutcomeVerdict shape defensively.
    return {
      verdict: m.verdict as OutcomeVerdict['verdict'],
      confidence: (m.confidence as OutcomeVerdict['confidence']) ?? 'low',
      rationale: (m.rationale as string) ?? '',
      judgedAgainst: (m.judgedAgainst as OutcomeVerdict['judgedAgainst']) ?? 'success-criteria',
      unmetCriteria: Array.isArray(m.unmetCriteria) ? (m.unmetCriteria as string[]) : [],
      authority: (m.authority as OutcomeVerdict['authority']) ?? 'advisory',
    };
  } catch {
    return undefined;
  }
}
