import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  NO_PIPELINE_REVIEW,
  parseProvenanceStamp,
  renderParsedStamp,
  stampCoverage,
  type CiReviewResult,
  type DiffInfo,
  type ParsedProvenanceStamp,
  type StampCoverage,
} from '@harness-engineering/core';
import { GraphStore } from '@harness-engineering/graph';
import type { NodeType } from '@harness-engineering/graph';
import { gatherSignals } from '@harness-engineering/signals';
import type { SignalResult, SignalsResult } from '@harness-engineering/signals';
import type { OutcomeVerdict, GuardianAnalysis } from '@harness-engineering/intelligence';
import {
  readGuardianAnalyses,
  summarizeGuardian,
  guardianFlags,
  guardianFileLines,
} from '@harness-engineering/intelligence';
import { buildDiffInfo, defaultRunGit, resolveDiffRange, type RunGit } from './review-ci';
import { commentsOf, defaultPrReader, resolvePrNumber, type PrRead } from '../github/pr';

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
  /**
   * Advisory guardian diff-coverage records from `.harness/analyses/` (#914).
   * Empty/undefined degrades the section to "unavailable"; a flagged record
   * (fail / error-severity) additionally contributes to "Worth your eyes".
   */
  guardian?: GuardianAnalysis[] | undefined;
  /**
   * The review provenance stamp parsed from the PR body; undefined when the body holds none,
   * `'unavailable'` when the body could not be read.
   */
  provenance?: ParsedProvenanceStamp | 'unavailable' | undefined;
  /** The PR's head commit, when it could be read: the stamp is compared with it. */
  prHead?: string | undefined;
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
  if (blocking.length) out.push('', '### Blocking', ...capped(blocking.map(findingLine)));
  const nonBlocking = findings.filter((f) => !blocking.some((b) => b.id === f.id));
  if (nonBlocking.length) {
    out.push('', '### Other findings', ...capped(nonBlocking.map(findingLine)));
  }
  return out;
}

function renderReviewVerdict(verdict?: CiReviewResult['verdict']): string[] {
  if (!verdict) return ['## Review verdict', '', UNAVAILABLE];
  return ['## Review verdict', '', ...renderPopulatedVerdict(verdict)];
}

/** The line every Review provenance section opens with, whatever the PR body held. */
const STATED_NOT_VERIFIED =
  '_As stated in the PR body by its author; not verified by CI (review receipts are machine-local)._';

/**
 * A stamp was found (its markers and heading) and the reader kept none of its lines: it may come
 * from another harness version. That is not the renderer's "no pipeline review recorded".
 */
const NOTHING_READ = (dropped: number) =>
  `> **Stamp found, nothing read.** A stamp was found but none of its lines could be read (${dropped} dropped); it may come from another harness version. This is neither "${NO_PIPELINE_REVIEW}" nor a pass.`;

/**
 * Render the **Review provenance** section from the stamp autopilot placed in the PR body:
 * which reviews ran, at what tier, with how many reviewers of how many required. The PR author
 * writes the body and CI has no receipts to check it against, so the section always opens by
 * saying so, and only lines of the stamp's own shape are shown. A body with no stamp, or with the
 * renderer's own no-review stamp, reads as "no pipeline review recorded"; a body that could not
 * be read reads as unavailable; a stamp found with no line kept reads as found and not read; a
 * stamp the parser did not read (`conflicting`, `too-large`, `ambiguous`) reads as that state,
 * with its reason. None of the last three is "no pipeline review recorded" or a pass.
 */
function renderReviewProvenance(
  stamp?: ParsedProvenanceStamp | 'unavailable',
  prHead?: string
): string[] {
  const out: string[] = ['## Review provenance', '', STATED_NOT_VERIFIED, ''];
  if (stamp === 'unavailable') return [...out, UNAVAILABLE];
  if (stamp === undefined) return [...out, `> _${NO_PIPELINE_REVIEW}._`];
  if (stamp.status !== 'read') return [...out, ...renderParsedStamp(stamp).map((l) => `> ${l}`)];
  if (stamp.rows.length + stamp.notes.length === 0 && !stamp.noReview) {
    return [...out, NOTHING_READ(stamp.dropped + stamp.omitted)];
  }
  if (stamp.noReview) out.push(`> _${NO_PIPELINE_REVIEW}._`, ...(stamp.notes.length ? [''] : []));
  out.push(...renderParsedStamp(stamp));
  return [...out, ...leftOutLines(stamp), ...coverageLines(stamp, prHead)];
}

/** The counts of stamp lines the parser left out, as the brief writes them. */
function leftOutLines(stamp: ParsedProvenanceStamp): string[] {
  const out: string[] = [];
  if (stamp.dropped > 0) {
    out.push(
      '',
      `> ${stamp.dropped} line(s) between the stamp markers are not stamp lines and are not shown.`
    );
  }
  if (stamp.omitted > 0) {
    out.push(
      '',
      `> ${stamp.omitted} line(s) of the stamp are over its size bounds and are not shown.`
    );
  }
  return out;
}

/**
 * Whether the stamp covers the PR head (core stampCoverage), as the brief words it. A stamp with
 * no row says nothing here: its own line already does.
 */
function coverageLines(stamp: ParsedProvenanceStamp, prHead: string | undefined): string[] {
  const text = stamp.rows.length === 0 ? undefined : coverageText(stampCoverage(stamp, prHead));
  return text === undefined ? [] : ['', `> ${text}`];
}

function coverageText(c: StampCoverage): string | undefined {
  switch (c.state) {
    case 'not-read':
      return undefined;
    case 'no-final-row': {
      const lead = c.head === undefined ? 'This' : `The PR head is ${c.head}; this`;
      const passed = c.passed.length > 0 ? ` (other rows passed at: ${c.passed.join(', ')})` : '';
      return `${lead} stamp has no final-all row, so it states no final review of the PR${passed}.`;
    }
    case 'several-final-rows':
      return `This stamp has ${c.finalRows} final-all rows, so none is compared with the PR head, and the PR head is not shown as covered.`;
    case 'head-unknown':
      return `The PR head could not be read, so this stamp's final review (gate: ${c.finalGate}) is not compared with it.`;
    case 'current':
      return `The PR head is ${c.head}, the commit this stamp's final review is at (gate: ${c.finalGate}).`;
    case 'stale':
      return c.finalHead === undefined
        ? `The PR head is ${c.head}; this stamp's final review names no reviewed commit (gate: ${c.finalGate}), so it does not cover the PR head.`
        : `The PR head is ${c.head}; this stamp's final review is at ${c.finalHead} (gate: ${c.finalGate}). Commits after ${c.finalHead} are not covered.`;
  }
}

/** GitHub rejects a comment over 65,536 characters; the brief stays well under it. */
export const BRIEF_MAX_CHARS = 60000;

/** Items a finding list shows before `+N more`: the review verdict's lists and the 🛑 bullets. */
export const BRIEF_LIST_MAX = 50;

/** The first BRIEF_LIST_MAX lines, then how many were left out. */
function capped(lines: readonly string[]): string[] {
  if (lines.length <= BRIEF_LIST_MAX) return [...lines];
  return [...lines.slice(0, BRIEF_LIST_MAX), `- +${lines.length - BRIEF_LIST_MAX} more`];
}

/**
 * One section of the brief and how fitting may treat it: `cut` sections lose text first (the
 * largest first), `last` only when cutting every `cut` section was not enough, `never` not at
 * all. `title` names it in the truncation mark.
 */
export interface BriefSection {
  title: string;
  lines: string[];
  fit: 'cut' | 'last' | 'never';
}

const CUT_NOTE = '> _This section is cut here (GitHub comment size limit)._';

const truncationMark = (chars: number, titles: readonly string[]) =>
  `> _Brief truncated: ${chars} characters are not shown (GitHub comment size limit); cut from: ${titles.join(', ')}._`;

const renderSections = (sections: readonly BriefSection[]) =>
  sections.map((s) => s.lines.join('\n')).join('\n\n');

/**
 * Cut lines from the end of a section (never its `## ` heading) until `need` characters are gone,
 * and say where. The characters removed; 0 when cutting would not save more than the note costs.
 */
function cutSection(section: BriefSection, need: number): number {
  const lines = section.lines.join('\n').split('\n');
  const keep = lines[0]?.startsWith('## ') ? 2 : 0;
  const removable = lines.slice(keep).reduce((n, l) => n + l.length + 1, 0);
  if (removable <= CUT_NOTE.length + 1) return 0;
  let removed = 0;
  while (lines.length > keep && removed < need + CUT_NOTE.length + 1) {
    removed += (lines.pop() ?? '').length + 1;
  }
  section.lines = [...lines, CUT_NOTE];
  return removed;
}

/**
 * The brief as one comment within BRIEF_MAX_CHARS. Over it, `cut` sections lose lines from their
 * end, the largest first, then `last` ones, until it fits; `never` sections (the header and the
 * Review provenance section) are not cut. Each cut section says where it was cut, and the mark at
 * the end says how many characters are not shown and names the sections that lost text.
 */
export function fitComment(sections: readonly BriefSection[]): string {
  const whole = renderSections(sections);
  if (whole.length <= BRIEF_MAX_CHARS) return whole;
  const out = sections.map((s) => ({ ...s, lines: [...s.lines] }));
  const budget =
    BRIEF_MAX_CHARS -
    truncationMark(
      whole.length,
      sections.map((s) => s.title)
    ).length -
    1;
  const cutFrom = new Set<BriefSection>();
  let removed = 0;
  for (const tier of ['cut', 'last'] as const) {
    const candidates = out
      .filter((s) => s.fit === tier)
      .sort((a, b) => renderSections([b]).length - renderSections([a]).length);
    for (const section of candidates) {
      const need = renderSections(out).length - budget;
      if (need <= 0) break;
      const gone = cutSection(section, need);
      if (gone > 0) cutFrom.add(section);
      removed += gone;
    }
  }
  const titles = out.filter((s) => cutFrom.has(s)).map((s) => s.title);
  const kept = renderSections(out);
  // Only text beyond the bounds of the uncut sections gets here; keep a prefix, as before.
  const body =
    kept.length <= budget ? kept : kept.slice(0, Math.max(kept.lastIndexOf('\n', budget), 0));
  return `${body}\n${truncationMark(removed + (kept.length - body.length), titles)}`;
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
 * Render the **Guardian diff-coverage** section from advisory records in
 * `.harness/analyses/` (#914). Degrades to an "unavailable" line when no
 * guardian record is present — a missing/empty archive never errors and never
 * changes the rest of the brief.
 */
function renderGuardian(guardian?: GuardianAnalysis[]): string[] {
  const out: string[] = ['## Guardian diff-coverage', ''];
  if (!guardian || guardian.length === 0) {
    out.push(UNAVAILABLE);
    return out;
  }
  out.push(summarizeGuardian(guardian) ?? UNAVAILABLE);
  const fileLines = guardianFileLines(guardian);
  if (fileLines.length > 0) {
    out.push('', ...fileLines.map((l) => `- \`${l}\``));
  }
  return out;
}

/**
 * Derive the **"👀 Worth your eyes"** section: EXACTLY the union of (a) review
 * blocking findings, (b) signals with status `warn` or `alert`, (c) unmet
 * outcome criteria, and (d) flagged guardian diff-coverage records — no more,
 * no fewer. Renders "nothing flagged" when the union is empty.
 */
/**
 * Collect the "Worth your eyes" bullets: the union of (a) review blocking
 * findings, (b) signals with status `warn`/`alert`, and (c) unmet outcome
 * criteria (only when the verdict is NOT_SATISFIED — a SATISFIED/other verdict
 * may still carry a stale unmetCriteria array).
 */
function blockingBullets(inputs: BriefInputs): string[] {
  return capped(
    (inputs.review?.blockingFindings ?? []).map((f) => `- 🛑 ${findingLine(f).replace(/^- /, '')}`)
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

/** One bullet per FLAGGED guardian record (fail / error-severity). */
function guardianBullets(inputs: BriefInputs): string[] {
  return (inputs.guardian ?? [])
    .filter(guardianFlags)
    .map((g) => `- 🛡️ ${summarizeGuardian([g]) ?? 'Guardian diff-coverage flagged.'}`);
}

function collectWorthYourEyesBullets(inputs: BriefInputs): string[] {
  return [
    ...blockingBullets(inputs),
    ...signalBullets(inputs),
    ...unmetBullets(inputs),
    ...guardianBullets(inputs),
  ];
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
 * Pure Markdown render (no I/O, no process.exit). Assembles the brief section by section, in the
 * order the skill states: marker + header, Diff summary, Review verdict, Review provenance,
 * Signal status, Outcome evaluation, Guardian diff-coverage, "Worth your eyes". The finding lists
 * are capped (BRIEF_LIST_MAX), and fitComment keeps the header and Review provenance whole and
 * cuts "Worth your eyes" only after every other section.
 */
export function buildBriefBody(inputs: BriefInputs): string {
  return fitComment([
    { title: 'header', lines: [BRIEF_MARKER, '# 🧭 Pre-merge brief'], fit: 'never' },
    { title: 'Diff summary', lines: renderDiffSummary(inputs.diff), fit: 'cut' },
    { title: 'Review verdict', lines: renderReviewVerdict(inputs.review), fit: 'cut' },
    {
      title: 'Review provenance',
      lines: renderReviewProvenance(inputs.provenance, inputs.prHead),
      fit: 'never',
    },
    { title: 'Signal status', lines: renderSignalStatus(inputs.signals), fit: 'cut' },
    { title: 'Outcome evaluation', lines: renderOutcomeEval(inputs.outcome), fit: 'cut' },
    { title: 'Guardian diff-coverage', lines: renderGuardian(inputs.guardian), fit: 'cut' },
    { title: 'Worth your eyes', lines: deriveWorthYourEyes(inputs), fit: 'last' },
  ]);
}

/**
 * Seam for delivering the brief to a PR — real impl shells out to `gh`. `comments`: the PR's
 * comments when the run already read them with its body (one `gh pr view` a run); the poster
 * lists them itself otherwise.
 */
export type PostBrief = (body: string, pr?: number, comments?: MarkedComment[]) => void;

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

/** The PR's comments through `gh pr view --json comments`, for a run that did not read them. */
function listComments(target: string[]): MarkedComment[] {
  const raw = execFileSync('gh', ['pr', 'view', ...target, '--json', 'comments'], {
    encoding: 'utf-8',
  }).toString();
  const parsed = JSON.parse(raw) as { comments?: unknown };
  return Array.isArray(parsed?.comments) ? commentsOf(parsed.comments) : [];
}

/**
 * Default poster: upsert the brief as a single sticky PR comment via `gh`.
 *
 * Takes the PR's comments the run read with its body, else lists them
 * (`gh pr view --json comments`), finds the one carrying {@link BRIEF_MARKER},
 * and either PATCHes it in place (`gh api ... -X PATCH`) or posts a fresh one
 * (`gh pr comment --body-file -`, piping the body via stdin so a long brief
 * never hits the shell arg-length limit). Contains NO `process.exit`; the
 * caller owns exit codes.
 */
export const defaultPostBrief: PostBrief = (body, pr, known) => {
  // On a detached merge ref (the pull_request event) gh cannot find the PR from the checkout.
  const target = pr === undefined ? [] : [String(pr)];
  const comments = known ?? listComments(target);

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
      execFileSync('gh', ['pr', 'comment', ...target, '--body-file', '-'], {
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

/** Injected guardian-read seam. Defaults to the real `readGuardianAnalyses`. */
export type ReadGuardian = (analysesDir: string) => Promise<GuardianAnalysis[]>;

/**
 * Read advisory guardian diff-coverage records from `<cwd>/.harness/analyses`,
 * degrading to `[]` (never throwing) when the archive is absent or the read
 * rejects — the Guardian section then renders "unavailable" and nothing else in
 * the brief changes. `readGuardianAnalyses` is already tolerant; this wrapper
 * only guards against an unexpected reject from an injected seam.
 */
export async function gatherGuardianSafe(
  cwd: string,
  read: ReadGuardian = readGuardianAnalyses
): Promise<GuardianAnalysis[]> {
  try {
    return await read(join(cwd, '.harness', 'analyses'));
  } catch {
    return [];
  }
}

/** The minimal graph-store surface the outcome lookup needs. */
export interface OutcomeStore {
  findNodes(query: { type: NodeType }): Array<{ metadata: Record<string, unknown> }>;
}

/**
 * Best-effort graph load for the outcome lookup, mirroring
 * `gatherSignals`' `loadGraphStore`: returns `undefined` (never throws) when the
 * graph dir is absent or unloadable, preserving the "not yet evaluated"
 * degradation contract.
 */
export async function loadOutcomeStore(projectPath: string): Promise<OutcomeStore | undefined> {
  try {
    const { resolveGraphDir } = await import('@harness-engineering/graph');
    const store = new GraphStore();
    const loaded = await store.load(resolveGraphDir(projectPath));
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
  /** Injected guardian-read seam (default: real tolerant reader). */
  readGuardian?: ReadGuardian;
  store?: OutcomeStore | undefined;
  postBrief?: PostBrief;
  log?: (message: string) => void;
  /** Warning sink (stderr by default) for best-effort delivery failures. */
  warn?: (message: string) => void;
  /**
   * Read the PR's body and head; undefined when there is no PR, a throw when it could not be
   * read. Defaults to no read; the command action injects the `gh` reader.
   */
  readPr?: () => Pick<PrRead, 'body' | 'headSha' | 'comments'> | undefined;
  /** The PR to read and comment on (`--pr`, else GITHUB_REF). Default: the checked-out branch's PR. */
  pr?: number;
}

/**
 * The stamp parsed from the PR body (undefined: none; `'unavailable'`: a failed read), the PR
 * head, and the PR's comments when the read listed them (the poster reuses them).
 */
function readProvenanceSafe(
  read: PreMergeBriefOptions['readPr']
): Pick<BriefInputs, 'provenance' | 'prHead'> & { comments?: MarkedComment[] } {
  if (read === undefined) return {};
  try {
    const pr = read();
    const provenance = parseProvenanceStamp(pr?.body ?? '');
    return {
      provenance,
      ...(pr?.headSha !== undefined && { prHead: pr.headSha }),
      ...(pr?.comments !== undefined && { comments: pr.comments }),
    };
  } catch {
    return { provenance: 'unavailable' };
  }
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
  // review-ci's runner carries the raised maxBuffer: Node's 1MB default throws
  // ENOBUFS on a large PR's diff (#2455, #2321's class).
  const runGit = opts.runGit ?? defaultRunGit;
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
  const guardian = await gatherGuardianSafe(cwd, opts.readGuardian);
  const { comments, ...stated } = readProvenanceSafe(opts.readPr);

  const body = buildBriefBody({ diff, review, signals, outcome, guardian, ...stated });

  const log = opts.log ?? ((m: string) => process.stdout.write(m + '\n'));
  if (opts.comment) {
    // Delivery is best-effort: if `gh` fails (no PR for the branch, gh
    // unauthenticated, API error) we still print the rendered brief + a
    // one-line warning to stderr and let the caller exit 0.
    try {
      (opts.postBrief ?? defaultPostBrief)(body, opts.pr, comments);
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

/** The PR to read and comment on. A value that is not a PR number ends the run with exit 1. */
function prNumberOrExit(flag: unknown): number | undefined {
  const named = resolvePrNumber(flag, process.env.GITHUB_REF);
  if (named.ok) return named.pr;
  process.stderr.write(`pre-merge-brief: ${named.error}\n`);
  return process.exit(1);
}

/** The `--comment` help: the PR it posts to is the one the brief reads. */
const COMMENT_HELP =
  "upsert the brief as a sticky comment on the PR --pr names (else GITHUB_REF's, else the branch's)";

/** Build the top-level `harness pre-merge-brief` command. */
export function createPreMergeBriefCommand(): Command {
  return new Command('pre-merge-brief')
    .description(
      'Compose a senior-facing pre-merge PR brief in seven sections: diff summary, review verdict, ' +
        'review provenance (as stated in the PR body), Signal status, outcome-eval, Guardian analysis ' +
        'and "worth your eyes"'
    )
    .option(
      '--pr <number>',
      'PR to read and comment on (default: from GITHUB_REF, else the branch). Not a number: exit 1'
    )
    .option('--from <path>', 'review-ci --json verdict artifact')
    .option('--comment', COMMENT_HELP)
    .option('--diff <range>', 'git range (default: origin/<base>...HEAD)')
    .option('--head <sha>', 'head commit sha for the outcome lookup (default: git rev-parse HEAD)')
    .action(async (opts: Record<string, unknown>) => {
      const cwd = process.cwd();
      const pr = prNumberOrExit(opts.pr);
      const runGit: RunGit = defaultRunGit;
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
        readPr: () => defaultPrReader(cwd, pr),
        ...(pr !== undefined && { pr }),
      });
      // process.exit is confined to the commander action so the pure functions
      // above remain testable; every input degrades independently, so a
      // successful render is always exit 0.
      process.exit(0);
    });
}
