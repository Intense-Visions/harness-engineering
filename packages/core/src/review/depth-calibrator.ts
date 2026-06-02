import type { DiffInfo } from './types';

/**
 * Depth calibration tier. Selected by Phase 3.5 between CONTEXT and FAN-OUT.
 * Determines which conditional subagents activate; the existing 4 agents always run.
 *
 * Quick    — < 50 changed lines AND 0 risk keywords
 * Standard — 50–199 changed lines OR exactly 1 risk keyword
 * Deep     — ≥ 200 changed lines OR 2+ risk keywords
 */
export type ReviewDepth = 'quick' | 'standard' | 'deep';

/**
 * Conditional subagents whose dispatch is gated by depth + diff signals.
 */
export type ConditionalSubagent = 'adversarial' | 'typescript-strict' | 'frontend-races';

/**
 * Canonical risk-keyword list. Kept in sync with
 * `agents/skills/claude-code/harness-code-review/references/risk-keywords.md`.
 *
 * Modifications here MUST be reflected in the reference file.
 */
export const RISK_KEYWORDS: readonly string[] = Object.freeze([
  'auth',
  'authn',
  'authz',
  'password',
  'token',
  'payment',
  'billing',
  'migration',
  'migrate',
  'external API',
  'webhook',
  'cryptography',
  'crypto',
  'session',
  'cookie',
  'personally identifiable',
  'PII',
  'compliance',
]);

/** Files excluded from changed-line counting. */
const EXCLUDED_PATH_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /\.spec\.(ts|tsx|js|jsx|mjs|cjs)$/,
  /__tests__\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /\.generated\.(ts|tsx|js|jsx)$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
];

/** Async-UI signals that activate `frontend-races` (Decision 6). */
const ASYNC_UI_SIGNALS: readonly string[] = Object.freeze([
  '.tsx',
  'useEffect',
  'useState',
  'setTimeout',
  'setInterval',
  'addEventListener',
  'data-controller=',
]);

/** Returns true when a path should be excluded from changed-line counts. */
function isExcludedPath(path: string): boolean {
  return EXCLUDED_PATH_PATTERNS.some((re) => re.test(path));
}

/** Returns true when a path is a non-test TS/TSX file. */
function isProductionTsFile(path: string): boolean {
  if (!/\.(ts|tsx)$/.test(path)) return false;
  if (/\.d\.ts$/.test(path)) return false;
  return !isExcludedPath(path);
}

/** Count `+`/`-` lines in unified-diff content (excluding hunk headers). */
function countDiffLines(diffContent: string): number {
  let count = 0;
  for (const line of diffContent.split('\n')) {
    if (line.length === 0) continue;
    const first = line[0]!;
    if (first === '+' && !line.startsWith('+++')) count++;
    else if (first === '-' && !line.startsWith('---')) count++;
  }
  return count;
}

/**
 * Sum changed lines across the diff, excluding test/generated/lockfile paths.
 * When fileDiffs are absent the function falls back to the total recorded on
 * DiffInfo (proportionally reduced by the fraction of non-excluded files).
 */
export function countChangedLines(diff: DiffInfo): number {
  let total = 0;
  let counted = false;
  for (const [path, content] of diff.fileDiffs) {
    if (isExcludedPath(path)) continue;
    total += countDiffLines(content);
    counted = true;
  }
  if (counted) return total;

  if (diff.changedFiles.length === 0) return 0;
  const includedFiles = diff.changedFiles.filter((p) => !isExcludedPath(p)).length;
  if (includedFiles === 0) return 0;
  const ratio = includedFiles / diff.changedFiles.length;
  return Math.round(diff.totalDiffLines * ratio);
}

/**
 * Build a single haystack string used for risk-keyword matching.
 * Includes file paths, full diff content, and the commit message.
 */
function buildHaystack(diff: DiffInfo, commitMessage: string): string {
  const parts: string[] = [commitMessage];
  for (const [path, content] of diff.fileDiffs) {
    parts.push(path);
    parts.push(content);
  }
  if (diff.fileDiffs.size === 0) {
    parts.push(...diff.changedFiles);
  }
  return parts.join('\n');
}

const WORD_BOUNDARY = /[A-Za-z0-9_]/;

/**
 * Case-insensitive whole-token match for a keyword in a haystack.
 * Tokens are bounded by non-alphanumeric characters; substring matching
 * is allowed for keywords containing whitespace (e.g. "external API").
 */
function keywordMatches(keyword: string, haystack: string): boolean {
  const lowerKey = keyword.toLowerCase();
  const lowerHay = haystack.toLowerCase();
  if (keyword.includes(' ')) {
    return lowerHay.includes(lowerKey);
  }
  let idx = lowerHay.indexOf(lowerKey);
  while (idx !== -1) {
    const before = idx === 0 ? '' : lowerHay[idx - 1]!;
    const after = lowerHay[idx + lowerKey.length] ?? '';
    const leftOk = before === '' || !WORD_BOUNDARY.test(before);
    const rightOk = after === '' || !WORD_BOUNDARY.test(after);
    if (leftOk && rightOk) return true;
    idx = lowerHay.indexOf(lowerKey, idx + 1);
  }
  return false;
}

/**
 * Return the set of unique risk keywords matched in the diff + commit message.
 */
export function detectRiskKeywords(diff: DiffInfo, commitMessage: string): string[] {
  const haystack = buildHaystack(diff, commitMessage);
  const matched: string[] = [];
  for (const keyword of RISK_KEYWORDS) {
    if (keywordMatches(keyword, haystack)) matched.push(keyword);
  }
  return matched;
}

/**
 * Compute the depth tier per Decision 8 thresholds.
 *
 * Quick    — < 50 lines AND 0 keywords
 * Deep     — ≥ 200 lines OR ≥ 2 keywords
 * Standard — otherwise (50–199 lines OR exactly one keyword)
 */
export function computeDepth(changedLines: number, riskKeywordCount: number): ReviewDepth {
  if (changedLines >= 200 || riskKeywordCount >= 2) return 'deep';
  if (changedLines < 50 && riskKeywordCount === 0) return 'quick';
  return 'standard';
}

/**
 * Result returned by the calibrator.
 */
export interface DepthCalibration {
  depth: ReviewDepth;
  /** Total changed lines counted (excluding tests/generated/lockfiles). */
  changedLines: number;
  /** Risk keywords matched in the diff + commit message. */
  riskSignals: string[];
  /** Set of conditional subagents that should be dispatched in Phase 4. */
  activations: Set<ConditionalSubagent>;
  /** True when activations were forced by a user override (`--depth deep`). */
  overridden: boolean;
}

/**
 * Determine which conditional subagents activate given the depth + diff content.
 *
 * - `adversarial`       — active at Standard or Deep
 * - `typescript-strict` — active when a non-test TS/TSX file is in the diff
 * - `frontend-races`    — active when typescript-strict is active AND an async-UI
 *                         signal appears in the diff
 *
 * `--depth deep` overrides and activates all three.
 */
export function computeActivations(
  depth: ReviewDepth,
  diff: DiffInfo,
  overridden: boolean
): Set<ConditionalSubagent> {
  if (overridden && depth === 'deep') {
    return new Set<ConditionalSubagent>(['adversarial', 'typescript-strict', 'frontend-races']);
  }

  const activations = new Set<ConditionalSubagent>();

  if (depth !== 'quick') activations.add('adversarial');

  const hasTsFile = diff.changedFiles.some(isProductionTsFile);
  if (hasTsFile) activations.add('typescript-strict');

  if (activations.has('typescript-strict') && hasAsyncUiSignal(diff)) {
    activations.add('frontend-races');
  }

  return activations;
}

/** Returns true when the diff content includes any async-UI signal. */
function hasAsyncUiSignal(diff: DiffInfo): boolean {
  const tsxInDiff = diff.changedFiles.some((p) => /\.tsx$/.test(p) && !isExcludedPath(p));
  if (tsxInDiff) return true;
  for (const [, content] of diff.fileDiffs) {
    for (const signal of ASYNC_UI_SIGNALS) {
      if (signal === '.tsx') continue;
      if (content.includes(signal)) return true;
    }
  }
  return false;
}

/**
 * Options for the calibrator entry point.
 */
export interface CalibrateDepthOptions {
  diff: DiffInfo;
  commitMessage: string;
  /** Author override — forces the depth tier and activates all conditional subagents at Deep. */
  override?: ReviewDepth;
}

/**
 * Phase 3.5 entry point. Returns a `DepthCalibration` describing the chosen
 * depth tier, risk signals matched, and the conditional-subagent activation set.
 */
export function calibrateDepth(options: CalibrateDepthOptions): DepthCalibration {
  const { diff, commitMessage, override } = options;
  const changedLines = countChangedLines(diff);
  const riskSignals = detectRiskKeywords(diff, commitMessage);
  const computed = computeDepth(changedLines, riskSignals.length);
  const depth = override ?? computed;
  const overridden = override !== undefined;
  const activations = computeActivations(depth, diff, overridden);

  return { depth, changedLines, riskSignals, activations, overridden };
}
