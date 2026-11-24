import type { ReviewTier } from '@harness-engineering/types';
import { normalizeReviewPath as posix } from '../receipts/schema';
import { matchRiskKeywords } from './depth-calibrator';

export const PHASE_COMPLEXITIES = ['low', 'medium', 'high'] as const;
export type PhaseComplexity = (typeof PHASE_COMPLEXITIES)[number];
export const REVIEW_RIGORS = ['fast', 'standard', 'thorough'] as const;
export type ReviewRigor = (typeof REVIEW_RIGORS)[number];

export interface PhaseTierInput {
  moment: 'phase';
  /** Repository-relative paths the range changes. */
  changedFiles: readonly string[];
  /** The unified diff of the range. Risk keywords are matched against it and the paths. */
  diffText: string;
  /** Every commit message of the range, matched for risk keywords. */
  commitMessages: readonly string[];
  /**
   * For each message, by position, the trailer lines git identified in it. Identity trailers
   * among them are not matched. Absent: nothing is left out.
   */
  commitTrailers?: ReadonlyArray<readonly string[]>;
  /** Repository-relative files named by any package.json `exports`, `main` or `bin` field. */
  entryPoints?: readonly string[];
  /** Autopilot's assessed complexity for the phase, after its ASSESS refinements. */
  complexity?: PhaseComplexity;
  rigor?: ReviewRigor;
}

/** A final or standalone review is always `full`, so it needs no diff. */
export type SelectReviewTierInput = { moment: 'final' | 'standalone' } | PhaseTierInput;

export interface ReviewTierSelection {
  tier: ReviewTier;
  /** Why the tier is `full`. Empty for `light`. */
  reasons: string[];
}

/** `src/index.ts` directly under a package root (or the repo root); not a nested `src/x/index.ts`. */
const PACKAGE_INDEX = /^(?:.*\/)?src\/index\.ts$/;

function leaves(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) leaves(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) leaves(v, out);
  }
}

/**
 * Files a parsed package.json names in `main`, `bin` and `exports`, as project-relative POSIX
 * paths. Pure: the caller reads the file. Patterns with `*` are returned verbatim and match
 * nothing.
 */
export function collectPackageEntryPoints(pkg: unknown, packageDir = ''): string[] {
  if (pkg === null || typeof pkg !== 'object') return [];
  const p = pkg as Record<string, unknown>;
  const raw: string[] = [];
  leaves(p.main, raw);
  leaves(p.bin, raw);
  leaves(p.exports, raw);
  const dir = posix(packageDir).replace(/\/+$/, '');
  const paths = raw.map((v) => (dir === '' ? posix(v) : `${dir}/${posix(v)}`));
  return [...new Set(paths)].sort();
}

/**
 * Trailer keys that name people or bookkeeping and say nothing about the change. A trailer git
 * identifies under any other key is matched like the rest of the message: git reads a closing
 * line such as "Security: the token check now runs" as a trailer too.
 */
const IDENTITY_TRAILER = /^(?:[A-Za-z0-9-]+-by|cc|change-id|claude-session):/i;

/**
 * A commit message without its identity trailers. `trailers` holds the trailer lines git itself
 * identified in the message (`%(trailers:only)`), continuation lines included; nothing is read
 * as a trailer because of how it looks. Only the closing block of the message is touched.
 */
function withoutIdentityTrailers(message: string, trailers: readonly string[]): string {
  const dropped = new Set<string>();
  let identity = false;
  for (const line of trailers) {
    if (!/^\s/.test(line)) identity = IDENTITY_TRAILER.test(line);
    if (identity) dropped.add(line);
  }
  if (dropped.size === 0) return message;
  const lines = message.trimEnd().split('\n');
  const block = lines.map((line) => line.trim()).lastIndexOf('') + 1;
  return lines.filter((line, i) => i < block || !dropped.has(line)).join('\n');
}

function riskKeywordReasons(input: PhaseTierInput): string[] {
  const messages = input.commitMessages.map((message, i) =>
    withoutIdentityTrailers(message, input.commitTrailers?.[i] ?? [])
  );
  const haystack = [...messages, ...input.changedFiles, input.diffText].join('\n');
  return matchRiskKeywords(haystack).map((k) => `risk-keyword:${k}`);
}

function entryPointReasons(input: PhaseTierInput): string[] {
  const entry = new Set((input.entryPoints ?? []).map(posix));
  return input.changedFiles
    .map(posix)
    .filter((f) => PACKAGE_INDEX.test(f) || entry.has(f))
    .map((f) => `entry-point:${f}`);
}

function assessmentReasons(input: PhaseTierInput): string[] {
  const out: string[] = [];
  if (input.complexity === 'high') out.push('complexity:high');
  if (input.rigor === 'thorough') out.push('rigor:thorough');
  return out;
}

/**
 * Per-phase review tier (spec D5). A phase is `full` when any rule holds and `light` otherwise.
 * The final review is always `full`: no rigor level lowers it.
 */
export function selectReviewTier(input: SelectReviewTierInput): ReviewTierSelection {
  if (input.moment !== 'phase') return { tier: 'full', reasons: [`moment:${input.moment}`] };
  const reasons = [
    ...riskKeywordReasons(input),
    ...entryPointReasons(input),
    ...assessmentReasons(input),
  ];
  return { tier: reasons.length > 0 ? 'full' : 'light', reasons };
}
