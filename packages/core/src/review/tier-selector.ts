import type { ReviewTier } from '@harness-engineering/types';
import { normalizeReviewPath as posix } from '../receipts/paths';
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

/** `src/index.ts` directly under a package root (or the repo root); not a nested `src/x/index.ts`. `s`: a directory name may hold CR or LF. */
const PACKAGE_INDEX = /^(?:.*\/)?src\/index\.ts$/s;

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

/** One trailer as lines: its key line and the continuation lines folded under it. */
type TrailerLines = string[];

/** Lines grouped into trailers: a line that starts with whitespace continues the one before it. */
function groupTrailers(lines: readonly string[]): TrailerLines[] {
  const out: TrailerLines[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (/^\s/.test(line) && last !== undefined) last.push(line);
    else out.push([line]);
  }
  return out;
}

/**
 * A trailer by its parsed key and value, as git parses it: the key is the text before the first
 * colon, trimmed and compared without case; the value is the rest with the continuation lines
 * unfolded and every run of whitespace read as one space. undefined: the line holds no colon.
 */
function trailerKey(lines: TrailerLines): string | undefined {
  const [first = '', ...more] = lines;
  const colon = first.indexOf(':');
  if (colon < 0) return undefined;
  const key = first.slice(0, colon).trim().toLowerCase();
  const value = [first.slice(colon + 1), ...more].join(' ').replace(/\s+/g, ' ').trim();
  return `${key}:${value}`;
}

/**
 * A commit message without its identity trailers. `trailers` holds the trailer lines git itself
 * identified in the message (`%(trailers:only)`), continuation lines included, in git's own
 * printed form, which normalises spacing ("Signed-off-by :  A" prints as "Signed-off-by: A").
 * A trailer of the message's closing block is dropped when its key and value equal those of an
 * identity trailer git reported; nothing is read as a trailer because of how it looks.
 */
function withoutIdentityTrailers(message: string, trailers: readonly string[]): string {
  const dropped = new Set<string>();
  for (const trailer of groupTrailers(trailers)) {
    const key = trailerKey(trailer);
    if (key !== undefined && IDENTITY_TRAILER.test(trailer[0] ?? '')) dropped.add(key);
  }
  if (dropped.size === 0) return message;
  const lines = message.trimEnd().split('\n');
  const block = lines.map((line) => line.trim()).lastIndexOf('') + 1;
  const kept = groupTrailers(lines.slice(block)).filter((t) => {
    const key = trailerKey(t);
    return key === undefined || !dropped.has(key);
  });
  return [...lines.slice(0, block), ...kept.flat()].join('\n');
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
