import { minimatch } from 'minimatch';
import type { CloneUnitKind } from './units';

export type { CloneUnitKind, DupUnit } from './units';
export { extractUnits } from './units';
export {
  normalizeTokens,
  fingerprintStream,
  IDENTIFIER_PLACEHOLDER,
  LITERAL_PLACEHOLDER,
} from './tokens';

/** One occurrence of a clone class, located in its file. */
export interface CloneMember {
  /** Repo-relative, POSIX-normalized path. */
  file: string;
  /** The unit's identifier, or `'<anon>'`. */
  unit: string;
  kind: CloneUnitKind;
  startLine: number;
  endLine: number;
}

/** A set of units sharing one normalized token-stream fingerprint. */
export interface CloneClass {
  /** sha1 of the normalized token stream, 16 hex characters. */
  fingerprint: string;
  tokenCount: number;
  /** Length is always `>= minInstances`. */
  members: CloneMember[];
  /** `tokenCount * members.length` — the ranking key. */
  rank: number;
  /**
   * Always `'duplicate'` in Phase 1. The `'partial-extraction'` derivation
   * (spec decision D8) lands in Phase 4; the field exists now so #1612/#1646
   * bind against a stable interface.
   */
  signal: 'duplicate' | 'partial-extraction';
  /** Set only when `signal === 'partial-extraction'` — unset in Phase 1. */
  sharedImport?: string;
}

/** The clone index over one discovered file set. */
export interface CloneIndex {
  /** Qualifying classes, rank-descending, capped at `maxClasses`. */
  classes: CloneClass[];
  /** `${file}:${startLine}` -> owning class. The seam for code-craft (Phase 5). */
  byMember: Map<string, CloneClass>;
  stats: {
    filesScanned: number;
    /** Unreadable or unparseable — see the spec's Failure behavior section. */
    filesSkipped: number;
    /** Units that cleared `minTokens` and were hashed into a group. */
    unitsFingerprinted: number;
    /**
     * Units excluded **before** grouping for yielding fewer than `minTokens`
     * tokens. Such a unit is never fingerprinted and can never form or join a
     * clone class, so it is never counted in `classesSuppressed`.
     */
    unitsBelowMinTokens: number;
    classesReported: number;
    /**
     * Classes that actually formed (>= 2 members) and were then dropped for
     * falling below `minInstances` or matching `ignorePatterns`. A unit that
     * never reached grouping is counted in `unitsBelowMinTokens` instead.
     */
    classesSuppressed: number;
    /** Groups dropped by the maxClasses report cap. */
    classesTruncated: number;
  };
}

/** Tunables for the duplication index. */
export interface DuplicationConfig {
  /** Minimum normalized tokens for a unit to be fingerprinted. Default 40. */
  minTokens: number;
  /** Minimum members for a class to be reported. Default 3 (Rule of Three). */
  minInstances: number;
  /** Globs matched against the repo-relative path; matches are never read. */
  ignorePatterns: string[];
  /** Report cap; the top `maxClasses` by rank survive. Default 100. */
  maxClasses: number;
}

/**
 * TS/JS only (spec decision D9) — exactly the existing static-analysis
 * surface. Mirrors `comprehension/static-extractor.ts`'s
 * `STATIC_SUPPORTED_EXTENSIONS`; duplicated as a local constant rather than
 * imported so the duplication module takes on no cross-module dependency.
 */
const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Default exclusions: tests, fixtures, generated files, declarations, barrels. */
const DEFAULT_IGNORE_PATTERNS: string[] = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.js',
  '**/*.test.jsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.spec.js',
  '**/*.spec.jsx',
  '**/*.bench.ts',
  '**/tests/**',
  '**/test/**',
  '**/__tests__/**',
  '**/fixtures/**',
  '**/__fixtures__/**',
  '**/generated/**',
  '**/*.generated.ts',
  '**/index.ts',
  '**/index.js',
  '**/index.mjs',
  '**/index.cjs',
];

/** The shipped defaults: Rule of Three above a 40-token floor, capped at 100. */
export const DEFAULT_DUPLICATION_CONFIG: DuplicationConfig = {
  minTokens: 40,
  minInstances: 3,
  ignorePatterns: DEFAULT_IGNORE_PATTERNS,
  maxClasses: 100,
};

/** Options accepted by {@link buildCloneIndex}. */
export interface BuildCloneIndexOptions extends Partial<DuplicationConfig> {
  /**
   * Root that `CloneMember.file` is made relative to. Defaults to
   * `process.cwd()`. Kept off `DuplicationConfig` so that type stays exactly
   * as specified and as Phase 2 wires it into `EntropyConfig`.
   */
  rootDir?: string;
}

/** Merge partial options over the defaults. */
export function resolveDuplicationConfig(
  overrides: Partial<DuplicationConfig> = {}
): DuplicationConfig {
  return { ...DEFAULT_DUPLICATION_CONFIG, ...overrides };
}

/**
 * True when a repo-relative path is a supported source file that no ignore
 * pattern matches. Ineligible files are never read, so they appear in neither
 * `filesScanned` nor `filesSkipped`.
 *
 * `.d.ts` is rejected explicitly: it ends in `.ts` but carries no logic, so a
 * declaration clone class would be a guaranteed false positive under the
 * spec's own audit rejection criteria.
 */
export function isEligibleFile(relPath: string, ignorePatterns: readonly string[]): boolean {
  if (relPath.endsWith('.d.ts')) return false;
  if (!SUPPORTED_EXTENSIONS.some((ext) => relPath.endsWith(ext))) return false;
  return !ignorePatterns.some((pattern) => minimatch(relPath, pattern, { dot: true }));
}
