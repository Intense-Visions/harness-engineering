import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import type { CiReviewResult, DiffInfo } from '@harness-engineering/core';
import { GraphStore } from '@harness-engineering/graph';
import type { NodeType } from '@harness-engineering/graph';
import { gatherSignals } from '@harness-engineering/signals';
import type { SignalResult, SignalsResult } from '@harness-engineering/signals';
import type { OutcomeVerdict } from '@harness-engineering/intelligence';
import { buildDiffInfo, resolveDiffRange, type RunGit } from './review-ci';

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
/** Render the body of a present verdict (extracted to keep the guard fn simple). */
function renderPopulatedVerdict(verdict: CiReviewResult['verdict']): string[] {
  const findings = verdict.findings ?? [];
  const blocking = verdict.blockingFindings ?? [];
  const out: string[] = [
    `**Assessment:** \`${verdict.assessment}\`  •  **Runner:** \`${verdict.runner}\`` +
      `  •  **Findings:** ${findings.length} (blocking: ${blocking.length})`,
  ];
  if (verdict.skipped) {
    out.push('', `> ⚠️ ${verdict.skipReason ?? 'A review tier was skipped.'}`);
  }
  if (blocking.length) out.push('', '### Blocking', ...blocking.map(findingLine));
  const nonBlocking = findings.filter((f) => !blocking.some((b) => b.id === f.id));
  if (nonBlocking.length) out.push('', '### Other findings', ...nonBlocking.map(findingLine));
  return out;
}

function renderReviewVerdict(verdict?: CiReviewResult['verdict']): string[] {
  if (!verdict) return ['## Review verdict', '', UNAVAILABLE];
  return ['## Review verdict', '', ...renderPopulatedVerdict(verdict)];
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
/**
 * Collect the "Worth your eyes" bullets: the union of (a) review blocking
 * findings, (b) signals with status `warn`/`alert`, and (c) unmet outcome
 * criteria (only when the verdict is NOT_SATISFIED — a SATISFIED/other verdict
 * may still carry a stale unmetCriteria array).
 */
function blockingBullets(inputs: BriefInputs): string[] {
  return (inputs.review?.blockingFindings ?? []).map(
    (f) => `- 🛑 ${findingLine(f).replace(/^- /, '')}`
  );
}

function signalBullets(inputs: BriefInputs): string[] {
  return (inputs.signals ?? [])
    .filter((s) => s.status === 'warn' || s.status === 'alert')
    .map((s) => `- 📊 ${signalLine(s).replace(/^- /, '')}`);
}

function unmetBullets(inputs: BriefInputs): string[] {
  const unmet =
    inputs.outcome?.verdict === 'NOT_SATISFIED' ? (inputs.outcome.unmetCriteria ?? []) : [];
  return unmet.map((c) => `- 🎯 ${c}`);
}

function collectWorthYourEyesBullets(inputs: BriefInputs): string[] {
  return [...blockingBullets(inputs), ...signalBullets(inputs), ...unmetBullets(inputs)];
}

function deriveWorthYourEyes(inputs: BriefInputs): string[] {
  const bullets = collectWorthYourEyesBullets(inputs);
  if (bullets.length === 0) {
    return [
      '## 👀 Worth your eyes',
      '',
      '_Nothing flagged — no blocking findings, no warn/alert signals, no unmet criteria._',
    ];
  }
  return ['## 👀 Worth your eyes', '', ...bullets];
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
  // Anchor on the FIRST line: buildBriefBody always emits the marker as line 1,
  // so this avoids PATCHing a human comment that merely quotes a prior brief.
  const marked = comments.find((c) => c.body.trimStart().startsWith(BRIEF_MARKER));
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
      // PATCH the existing comment in place via the REST API. The body is piped
      // via stdin (`-F body=@-`) so a long brief never hits the shell
      // arg-length limit (E2BIG) on the steady-state sticky-update path.
      execFileSync(
        'gh',
        ['api', '-X', 'PATCH', `/repos/{owner}/{repo}/issues/comments/${id}`, '-F', 'body=@-'],
        { input: patchBody, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' }
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
    // Light shape guard: only return a non-null object verdict so a truncated /
    // garbage `--from` file degrades to "unavailable" rather than rendering
    // undefined-riddled bullets.
    return parsed?.verdict && typeof parsed.verdict === 'object' ? parsed.verdict : undefined;
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
  findNodes(query: { type: NodeType }): Array<{ metadata: Record<string, unknown> }>;
}

/**
 * Directory (relative to the project root) where the knowledge graph is
 * persisted — the SAME path `gatherSignals` loads from (`.harness/graph`).
 */
const GRAPH_DIR = '.harness/graph';

/**
 * Best-effort graph load for the outcome lookup, mirroring
 * `gatherSignals`' `loadGraphStore`: returns `undefined` (never throws) when the
 * graph dir is absent or unloadable, preserving the "not yet evaluated"
 * degradation contract.
 */
export async function loadOutcomeStore(projectPath: string): Promise<OutcomeStore | undefined> {
  try {
    const store = new GraphStore();
    const loaded = await store.load(join(projectPath, GRAPH_DIR));
    return loaded ? store : undefined;
  } catch {
    return undefined;
  }
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

// ── Orchestration ────────────────────────────────────────────────────────────

/** Resolve the raw unified-diff string for a range via the injectable git seam. */
function defaultResolveRaw(range: string, _cwd: string, runGit: RunGit): string {
  return runGit(['diff', range]);
}

/** Options for {@link runPreMergeBrief}. Every seam defaults to the real impl. */
export interface PreMergeBriefOptions {
  cwd?: string | undefined;
  /** Explicit git range (`--diff`); resolved via `resolveDiffRange` otherwise. */
  diffRange?: string | undefined;
  /** Path to a `review-ci --json` artifact (`--from`). */
  from?: string | undefined;
  /** Head commit sha used for the best-effort outcome lookup. */
  headSha?: string | undefined;
  /** When true, upsert the brief as a sticky PR comment; otherwise print it. */
  comment?: boolean | undefined;
  // Injected seams (default to the real implementations):
  runGit?: RunGit;
  resolveRaw?: (range: string, cwd: string, runGit: RunGit) => string;
  readFile?: ReadFile;
  gather?: GatherSignals;
  store?: OutcomeStore | undefined;
  postBrief?: PostBrief;
  log?: (message: string) => void;
  /** Warning sink (stderr by default) for best-effort delivery failures. */
  warn?: (message: string) => void;
}

/**
 * Pure orchestration for `pre-merge-brief`: resolve the diff range, assemble the
 * (independently degrading) inputs, render the brief, and either upsert it as a
 * sticky comment (`--comment`) or print it. Returns the rendered `{ body }`.
 *
 * Contains NO `process.exit` — the commander action owns the exit code — so this
 * stays fully unit-testable with injected seams.
 */
export async function runPreMergeBrief(opts: PreMergeBriefOptions): Promise<{ body: string }> {
  const cwd = opts.cwd ?? process.cwd();
  const runGit =
    opts.runGit ?? ((args) => execFileSync('git', args, { encoding: 'utf-8' }).toString().trim());
  const range = resolveDiffRange({
    ...(opts.diffRange ? { range: opts.diffRange } : {}),
    cwd,
    runGit,
  });
  // Diff degrades to undefined (→ "unavailable") when the range yields nothing.
  let diff: DiffInfo | undefined;
  try {
    const rawDiff = (opts.resolveRaw ?? defaultResolveRaw)(range, cwd, runGit);
    diff = rawDiff.trim() ? buildDiffInfo(rawDiff) : undefined;
  } catch {
    diff = undefined;
  }

  const review = readReview(opts.from, opts.readFile);
  const signals = await gatherSignalsSafe(cwd, opts.gather);
  const outcome = findOutcomeVerdict(opts.store, opts.headSha);

  const body = buildBriefBody({ diff, review, signals, outcome });

  const log = opts.log ?? ((m: string) => process.stdout.write(m + '\n'));
  if (opts.comment) {
    // Delivery is best-effort: if `gh` fails (no PR for the branch, gh
    // unauthenticated, API error) we still print the rendered brief + a
    // one-line warning to stderr and let the caller exit 0.
    try {
      (opts.postBrief ?? defaultPostBrief)(body);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      (opts.warn ?? ((m: string) => process.stderr.write(m + '\n')))(
        `⚠️ pre-merge-brief: could not post sticky comment (${reason}); printing brief instead.`
      );
      log(body);
    }
  } else {
    log(body);
  }
  return { body };
}

/** Build the top-level `harness pre-merge-brief` command. */
export function createPreMergeBriefCommand(): Command {
  return new Command('pre-merge-brief')
    .description(
      'Compose a senior-facing pre-merge PR brief (diff, review, signals, outcome, "worth your eyes")'
    )
    .option('--from <path>', 'review-ci --json verdict artifact')
    .option('--comment', "upsert the brief as a sticky comment on the current branch's PR")
    .option('--diff <range>', 'git range (default: origin/<base>...HEAD)')
    .option('--head <sha>', 'head commit sha for the outcome lookup (default: git rev-parse HEAD)')
    .action(async (opts: Record<string, unknown>) => {
      const cwd = process.cwd();
      // Reuse the RunGit seam pattern already used by the orchestrator instead
      // of adding a new raw exec.
      const runGit: RunGit = (args) =>
        execFileSync('git', args, { encoding: 'utf-8' }).toString().trim();
      // Resolve the head sha (default: `git rev-parse HEAD`), degrading to
      // undefined (→ "not yet evaluated") if git can't resolve it.
      let headSha = opts.head as string | undefined;
      if (!headSha) {
        try {
          headSha = runGit(['rev-parse', 'HEAD']) || undefined;
        } catch {
          headSha = undefined;
        }
      }
      // Construct the graph store from `.harness/graph` (same path as
      // gatherSignals); undefined when absent/unloadable, preserving the
      // "not yet evaluated" degradation contract.
      const store = await loadOutcomeStore(cwd);
      await runPreMergeBrief({
        cwd,
        from: opts.from as string | undefined,
        comment: opts.comment as boolean | undefined,
        diffRange: opts.diff as string | undefined,
        headSha,
        store,
        runGit,
      });
      // process.exit is confined to the commander action so the pure functions
      // above remain testable; every input degrades independently, so a
      // successful render is always exit 0.
      process.exit(0);
    });
}
