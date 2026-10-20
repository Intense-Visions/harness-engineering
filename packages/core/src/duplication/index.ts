import { minimatch } from 'minimatch';
import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { readFileContent, relativePosix } from '../shared/fs-utils';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { EntropyError } from '../shared/errors';
import { createEntropyError } from '../shared/errors';
import type { CloneUnitKind } from './units';
import { extractUnits as extractUnitsImpl } from './units';
import { normalizeTokens as normalize, fingerprintStream as digest } from './tokens';

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
     * falling below `minInstances`. A unit that never reached grouping is
     * counted in `unitsBelowMinTokens` instead. `ignorePatterns` is NOT a
     * contributor: it filters at file level before any read, so an ignored
     * file's units never group.
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

/**
 * Default exclusions: tests, fixtures, generated files, and build output.
 *
 * `index.*` is deliberately NOT excluded. An earlier revision ignored it as a
 * "barrel", which was wrong twice over: a true barrel is pure re-exports, so it
 * yields no units and cannot produce a false positive — the glob bought
 * nothing — while in practice `index.ts` is routinely a package's main
 * implementation module. Measured over this repo's package sources: the globs suppressed
 * 10 of 58 classes (17%), including `sumCosts` x10, the first named item in
 * this spec's own Evidence section, and this module's own 392-line `index.ts`
 * excluded itself.
 *
 * Frozen because `DEFAULT_DUPLICATION_CONFIG` hands this exact array out on a
 * public API and {@link resolveDuplicationConfig} shallow-spreads, so every
 * resolved config would otherwise share one mutable instance process-wide.
 */
const DEFAULT_IGNORE_PATTERNS = Object.freeze([
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
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
]) as readonly string[];

/** The shipped defaults: Rule of Three above a 40-token floor, capped at 100. */
export const DEFAULT_DUPLICATION_CONFIG: DuplicationConfig = {
  minTokens: 40,
  minInstances: 3,
  // Spread, not aliased: the frozen source array must not become the one
  // instance every resolved config shares.
  ignorePatterns: [...DEFAULT_IGNORE_PATTERNS],
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
  const merged = { ...DEFAULT_DUPLICATION_CONFIG, ...overrides };
  // Copy the array too: a shallow spread would alias the defaults' own
  // instance into every resolved config, so one consumer `.push()` would leak
  // into every later caller.
  return { ...merged, ignorePatterns: [...merged.ignorePatterns] };
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

/** One fingerprinted unit: its digest, token count, and located member. */
export interface FingerprintedUnit {
  fingerprint: string;
  tokenCount: number;
  member: CloneMember;
}

/** Why a file produced no units. */
export type FileSkipReason = 'unreadable' | 'unparseable';

/** Outcome of fingerprinting one file. */
export type FingerprintFileResult =
  | {
      status: 'scanned';
      units: FingerprintedUnit[];
      /** Units dropped before hashing for falling below `minTokens`. */
      unitsBelowMinTokens: number;
    }
  | { status: 'skipped'; reason: FileSkipReason; message: string };

/**
 * Read, parse, and fingerprint every unit in one file.
 *
 * The module parses the file itself rather than consuming
 * `snapshot.files[].ast` (spec decision D7): `AST` is a lossy
 * `{ type, body: unknown, language }` wrapper and the parser registry
 * defaults to tree-sitter, so estree tokens would not survive the snapshot.
 * Precedent for a detector doing its own reads:
 * `entropy/detectors/complexity.ts`.
 *
 * `minTokens` is applied here, before any digest is computed, so a unit under
 * the bar is genuinely never fingerprinted and therefore can never form or join
 * a clone class. Those units are reported in `unitsBelowMinTokens`. A unit's
 * token count is only knowable after normalization, so normalization runs for
 * every unit; the hash does not.
 *
 * Never throws: an unreadable or unparseable file resolves to
 * `{ status: 'skipped' }` so the caller can increment `filesSkipped` and
 * continue. Phase 2's detector converts a skip into an `AnalysisError` with
 * `analyzer: 'duplication'`; the entropy types live there, not here.
 *
 * @param absPath - Absolute path to read.
 * @param relPath - Repo-relative POSIX path recorded on each `CloneMember`.
 * @param minTokens - Units yielding fewer normalized tokens than this are
 *   excluded before hashing. Defaults to `0` (exclude nothing).
 */
export async function fingerprintFile(
  absPath: string,
  relPath: string,
  minTokens = 0
): Promise<FingerprintFileResult> {
  const contentResult = await readFileContent(absPath);
  if (!contentResult.ok) {
    return { status: 'skipped', reason: 'unreadable', message: contentResult.error.message };
  }

  // Explicitly typed, not an evolving `let`. Definite-assignment analysis
  // proves it is set: the catch arm returns.
  let program: TSESTree.Program;
  try {
    program = parse(contentResult.value, {
      tokens: true,
      loc: true,
      range: true,
      jsx: relPath.endsWith('.tsx') || relPath.endsWith('.jsx'),
      errorOnUnknownASTType: false,
    });
  } catch (e) {
    return { status: 'skipped', reason: 'unparseable', message: (e as Error).message };
  }

  const tokens = program.tokens ?? [];
  const units: FingerprintedUnit[] = [];
  let unitsBelowMinTokens = 0;
  for (const unit of extractUnitsImpl(program)) {
    const stream = normalize(tokens, unit.range);
    if (stream.length < minTokens) {
      unitsBelowMinTokens += 1;
      continue;
    }
    units.push({
      fingerprint: digest(stream),
      tokenCount: stream.length,
      member: {
        file: relPath,
        unit: unit.name,
        kind: unit.kind,
        startLine: unit.startLine,
        endLine: unit.endLine,
      },
    });
  }
  return { status: 'scanned', units, unitsBelowMinTokens };
}

/**
 * Build a Type-1/2 clone index over `files`.
 *
 * Single-pass by construction — one parse per file, one digest per unit, one
 * `Map` grouping pass. There is no member-against-member comparison, so cost
 * is linear in total tokens, not quadratic in unit count.
 *
 * Discovery is the caller's: `files` is a list of absolute paths, so nothing
 * here assumes any repository layout (success criterion 15). Ineligible paths
 * (unsupported extension, or matched by `ignorePatterns`) are dropped before
 * any read and are counted in neither `filesScanned` nor `filesSkipped`.
 *
 * The two bars act at different stages, per the amended spec. `minTokens` is a
 * UNIT-level bar applied before grouping, inside {@link fingerprintFile}: a
 * sub-threshold unit is never hashed and lands in `unitsBelowMinTokens`, so it
 * can never form or join a class. `minInstances` is a CLASS-level bar applied
 * after grouping: a group that formed with at least two members but fewer than
 * `minInstances` is dropped and counted in `classesSuppressed`. A singleton
 * group is not duplication at all and is counted nowhere.
 *
 * @param files - Absolute file paths, e.g. the output of `findFiles`.
 * @param options - Partial {@link DuplicationConfig} plus an optional
 *   `rootDir` (default `process.cwd()`) that member paths are relative to.
 */
export async function buildCloneIndex(
  files: readonly string[],
  options: BuildCloneIndexOptions = {}
): Promise<Result<CloneIndex, EntropyError>> {
  const { rootDir = process.cwd(), ...overrides } = options;
  const config = resolveDuplicationConfig(overrides);

  const eligible: Array<{ abs: string; rel: string }> = [];
  for (const abs of files) {
    const rel = relativePosix(rootDir, abs);
    if (isEligibleFile(rel, config.ignorePatterns)) eligible.push({ abs, rel });
  }

  if (eligible.length === 0) {
    return Err(
      createEntropyError(
        'INVALID_CONFIG',
        `Refusing to report a pass over zero source files: duplication discovery resolved ${files.length} candidate path(s) and 0 eligible TS/JS source file(s) under ${rootDir}.`,
        { reason: 'zero-files-discovered', file: rootDir },
        [
          'Check that EntropyConfig.include matches real source paths',
          'Check that EntropyConfig.exclude / duplication.ignorePatterns are not excluding everything',
          'Confirm the project contains .ts/.tsx/.js/.jsx/.mjs/.cjs sources',
        ]
      )
    );
  }

  let filesScanned = 0;
  let filesSkipped = 0;
  let unitsFingerprinted = 0;
  let unitsBelowMinTokens = 0;
  const groups = new Map<string, FingerprintedUnit[]>();

  for (const { abs, rel } of eligible) {
    const outcome = await fingerprintFile(abs, rel, config.minTokens);
    if (outcome.status === 'skipped') {
      filesSkipped += 1;
      continue;
    }
    filesScanned += 1;
    unitsBelowMinTokens += outcome.unitsBelowMinTokens;
    for (const unit of outcome.units) {
      unitsFingerprinted += 1;
      const bucket = groups.get(unit.fingerprint);
      if (bucket === undefined) groups.set(unit.fingerprint, [unit]);
      else bucket.push(unit);
    }
  }

  // Every unit that reached grouping already cleared minTokens, so the only
  // remaining bar is minInstances. A group of >= 2 members that fails it is
  // suppressed; a singleton group is not duplication and is counted nowhere.
  const qualifying: CloneClass[] = [];
  let classesSuppressed = 0;
  for (const [fingerprint, units] of groups) {
    if (units.length < 2) continue;
    if (units.length < config.minInstances) {
      classesSuppressed += 1;
      continue;
    }
    const tokenCount = units[0]!.tokenCount;
    const members = units
      .map((u) => u.member)
      .sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine);
    qualifying.push({
      fingerprint,
      tokenCount,
      members,
      rank: tokenCount * members.length,
      // Phase 1 always 'duplicate'; the partial-extraction derivation is Phase 4.
      signal: 'duplicate',
    });
  }

  // Rank-descending, with fingerprint as a deterministic tiebreak so the
  // reported order never depends on filesystem or input ordering.
  qualifying.sort((a, b) => b.rank - a.rank || a.fingerprint.localeCompare(b.fingerprint));
  const classes = qualifying.slice(0, config.maxClasses);
  const classesTruncated = qualifying.length - classes.length;

  // byMember: first writer wins, iterating rank-descending, so an ambiguous
  // `${file}:${startLine}` key (a function and a nested arrow can share a
  // line) resolves deterministically to the highest-ranked owning class.
  const byMember = new Map<string, CloneClass>();
  for (const cls of classes) {
    for (const member of cls.members) {
      const key = `${member.file}:${member.startLine}`;
      if (!byMember.has(key)) byMember.set(key, cls);
    }
  }

  return Ok({
    classes,
    byMember,
    stats: {
      filesScanned,
      filesSkipped,
      unitsFingerprinted,
      unitsBelowMinTokens,
      classesReported: classes.length,
      classesSuppressed,
      classesTruncated,
    },
  });
}
