import { posix as pathPosix, win32 as pathWin32 } from 'node:path';
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
export { extractUnits, MissingNodeLocationError } from './units';
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
  /**
   * sha1 of the normalized token stream, 16 hex characters — exactly
   * `fingerprintStream(stream)`, so a consumer can recompute it.
   *
   * Units group on `${fingerprint}:${tokenCount}`, not on `fingerprint`
   * alone, so every member of a class provably agrees on `tokenCount`.
   */
  fingerprint: string;
  /** Shared by every member by construction — it is part of the group key. */
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

/** One file that was eligible but produced no units, and why. */
export interface SkippedFile {
  /** Repo-relative, POSIX-normalized path. */
  file: string;
  reason: FileSkipReason;
  /** The underlying read, parse, or extraction error message. */
  message: string;
  /**
   * The underlying error's `name` — e.g. `'MissingNodeLocationError'`,
   * `'TypeError'`, `'Error'`. A message alone loses the class of failure, and
   * the class is what separates "this file is bad" from "our code broke".
   */
  errorName: string;
  /**
   * The underlying `Error` itself, for Phase 2 to put in
   * `EntropyError.details.originalError` (which exists for exactly this).
   *
   * NOT JSON-serializable: a consumer that serializes the index must project
   * `message` / `errorName` instead of the object.
   */
  originalError: Error;
}

/**
 * Two units that share one 16-hex digest while disagreeing on `tokenCount` —
 * an OBSERVED digest collision, recorded rather than raised.
 *
 * Equal streams hash equally, so a length disagreement under one digest can
 * only be a collision. Because units group on `${fingerprint}:${tokenCount}`,
 * such a pair physically cannot land in one class: the scan is unaffected and
 * no false class forms. This record is what makes the 64-bit truncation
 * falsifiable — if these ever appear, widen the digest in `tokens.ts`.
 *
 * Measured clean at HEAD: 0 observed over the 8,165 fingerprinted units of the
 * MEASURED SCOPE — the 2,063 files that `findFiles` discovers under
 * `<repo>/packages` and {@link isEligibleFile} admits under the shipped
 * defaults, holding 13,394 extracted units.
 *
 * It is a PARTIAL detector, and deliberately so: a collision between two
 * EQUAL-length streams agrees on `tokenCount` and is invisible here (and to
 * any token-count check). Zero observed collisions therefore means "no
 * length-differing collision was seen", not "no collision occurred".
 */
export interface FingerprintCollision {
  /** The digest both units share. */
  fingerprint: string;
  /** The first-seen unit and the disagreeing one, in that order. */
  members: [CloneMember, CloneMember];
  /** Their token counts, positionally matching `members`. */
  tokenCounts: [number, number];
}

/** The clone index over one discovered file set. */
export interface CloneIndex {
  /** Qualifying classes, rank-descending, capped at `maxClasses`. */
  classes: CloneClass[];
  /** `${file}:${startLine}` -> owning class. The seam for code-craft (Phase 5). */
  byMember: Map<string, CloneClass>;
  /**
   * The first {@link MAX_EVIDENCE_ENTRIES} skipped files, in discovery order;
   * the rest are counted in `stats.skippedTruncated`.
   *
   * `stats.filesSkipped` is the count; this is the evidence. Phase 2's detector
   * is specified to convert each skip into an `AnalysisError` with
   * `analyzer: 'duplication'`, which it cannot do from a bare count — the
   * reason, message and `Error` were computed in {@link fingerprintFile} and
   * then discarded here.
   *
   * `'duplication'` is NOT yet a member of `AnalysisError['analyzer']`
   * (`entropy/types/report.ts`), so that binding does not typecheck today.
   * Adding the union member is Phase 2 registration work, named in the spec's
   * Phase 2 section; this describes the intended consumer, not a current one.
   */
  skipped: SkippedFile[];
  /**
   * The first {@link MAX_EVIDENCE_ENTRIES} observed length-differing digest
   * collisions, in discovery order; the rest are counted in
   * `stats.collisionsTruncated`. Empty on every scan measured so far.
   *
   * `stats.collisionsObserved` is the count; this is the evidence. A collision
   * is observed, not raised: grouping is keyed on
   * `${fingerprint}:${tokenCount}`, so the colliding units cannot share a
   * class and the rest of the scan is unaffected.
   */
  collisions: FingerprintCollision[];
  stats: {
    filesScanned: number;
    /**
     * Candidate paths dropped by {@link isEligibleFile} before any read:
     * unsupported extension, `.d.ts`, absolute, outside `rootDir`, or matched
     * by `ignorePatterns`.
     *
     * An ineligible file used to be counted NOWHERE — neither `filesScanned`
     * nor `filesSkipped` — so an operator could not tell that a scan had
     * silently dropped files. That invisibility is how the `index.*` ignore
     * glob hid 10 of 58 classes: nothing in the tool's own output said so, and
     * it took a bespoke measurement to find it. It matters more now that
     * `dist`, `build` and `coverage` are ignored by default and an adopter may
     * keep hand-written source under one of those path segments.
     */
    filesIgnored: number;
    /**
     * Unreadable, unparseable, unextractable, or internal-error — see the
     * spec's Failure behavior section. The exact total, which is `skipped`'s
     * length only while that array is under {@link MAX_EVIDENCE_ENTRIES}.
     */
    filesSkipped: number;
    /**
     * Skips NOT recorded in `skipped` because the evidence cap was reached:
     * `filesSkipped - skipped.length`.
     */
    skippedTruncated: number;
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
    /**
     * Length-differing digest collisions observed while grouping. The exact
     * total, which is `collisions`'s length only while that array is under
     * {@link MAX_EVIDENCE_ENTRIES}. Expected to be 0 — see
     * {@link FingerprintCollision} for why a 0 is weaker than it looks.
     */
    collisionsObserved: number;
    /**
     * Collisions NOT recorded in `collisions` because the evidence cap was
     * reached: `collisionsObserved - collisions.length`.
     */
    collisionsTruncated: number;
  };
}

/** Tunables for the duplication index. */
export interface DuplicationConfig {
  /** Minimum normalized tokens for a unit to be fingerprinted. Default 40. */
  minTokens: number;
  /** Minimum members for a class to be reported. Default 3 (Rule of Three). */
  minInstances: number;
  /**
   * Globs matched against the repo-relative POSIX path; matches are never read.
   *
   * The pattern language is **minimatch**, with `dot: true` (so a dotfile path
   * is matched by `**`) and `nocase: true`. This is deliberately worth naming:
   * once Phase 2 wires `analyze.duplication` into `EntropyConfig`, one config
   * file can carry three same-named `ignorePatterns` fields in TWO languages —
   * `DriftConfig.ignorePatterns` is compiled with `new RegExp(p)`
   * (`entropy/detectors/drift.ts`), `DeadCodeConfig.ignorePatterns` exists as
   * well, and `entropy/detectors/patterns.ts` uses minimatch WITHOUT `dot`.
   * A regex written for drift will not behave as a glob here.
   *
   * `readonly`, because {@link DEFAULT_DUPLICATION_CONFIG} is frozen and
   * nothing in this module mutates the array — `isEligibleFile` only reads it.
   */
  ignorePatterns: readonly string[];
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
 * implementation module. Re-measured at HEAD over the measured scope (see
 * {@link FingerprintCollision}): ignoring `index.*` drops the reported classes
 * from 58 to 48, suppressing 10 classes composed entirely of `index.*` files —
 * `sumCosts` x10 among them, the first named item in the spec's own Evidence
 * section — and this module's own `index.ts` excluded itself.
 *
 * Frozen, and aliased straight onto `DEFAULT_DUPLICATION_CONFIG` rather than
 * copied onto it. The previous revision froze only this module-private const
 * and spread a MUTABLE copy onto the export, which put the freeze somewhere no
 * caller could reach: `Object.isFrozen(DEFAULT_DUPLICATION_CONFIG)` was
 * `false`, pushing onto its `ignorePatterns` succeeded and leaked into every
 * later {@link resolveDuplicationConfig}, and `minTokens = 1` stuck
 * process-wide. With both the object and this array frozen, the alias is safe:
 * no binding can mutate it, and `resolveDuplicationConfig` still hands every
 * caller its own copy.
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

/**
 * The shipped defaults: Rule of Three above a 40-token floor, capped at 100.
 *
 * Frozen, including `ignorePatterns`, because this is a process-wide singleton
 * on a public API: one consumer's `.push()` or `minTokens = 1` would otherwise
 * reach every later caller through the spread in
 * {@link resolveDuplicationConfig}.
 */
export const DEFAULT_DUPLICATION_CONFIG: Readonly<DuplicationConfig> = Object.freeze({
  minTokens: 40,
  minInstances: 3,
  ignorePatterns: DEFAULT_IGNORE_PATTERNS,
  maxClasses: 100,
});

/**
 * Cap on each evidence array carried on the index — `skipped` and
 * `collisions`.
 *
 * `classes` was the only capped array (`maxClasses`), so `skipped` grew
 * without bound: a repo with thousands of unparseable files yielded one entry
 * per file, each carrying a full parse message and the `Error` behind it, and
 * Phase 2 is specified to serialize every one of them into an
 * `AnalysisError`. The counts stay exact — `stats.filesSkipped` and
 * `stats.collisionsObserved` are totals, not array lengths — and the overflow
 * is reported in `stats.skippedTruncated` / `stats.collisionsTruncated`,
 * mirroring `maxClasses` / `classesTruncated`.
 *
 * Not a {@link DuplicationConfig} field: that type is the spec'd four-field
 * shape Phase 2 wires into `EntropyConfig`, and this is an internal guard
 * rail, not a reporting threshold an operator tunes.
 */
export const MAX_EVIDENCE_ENTRIES = 100;

/** Options accepted by {@link buildCloneIndex}. */
export interface BuildCloneIndexOptions extends Partial<DuplicationConfig> {
  /**
   * Root that `CloneMember.file` is made relative to. Defaults to
   * `process.cwd()`. Kept off `DuplicationConfig` so that type stays exactly
   * as specified and as Phase 2 wires it into `EntropyConfig`.
   */
  rootDir?: string;
}

/**
 * Merge partial options over the defaults.
 *
 * The returned config is a fresh MUTABLE object with a fresh `ignorePatterns`
 * array, so a consumer may adjust its own copy; the frozen
 * {@link DEFAULT_DUPLICATION_CONFIG} is unreachable from it.
 */
export function resolveDuplicationConfig(
  overrides: Partial<DuplicationConfig> = {}
): DuplicationConfig {
  const merged = { ...DEFAULT_DUPLICATION_CONFIG, ...overrides };
  // Copy the array too. A shallow spread aliases whichever array it came from:
  // the frozen defaults' (where a consumer's `.push()` now throws instead of
  // leaking) or the caller's own (where a later mutation of theirs would
  // silently retune a config this function already returned).
  return { ...merged, ignorePatterns: [...merged.ignorePatterns] };
}

/**
 * True when a repo-relative path is a supported source file that no ignore
 * pattern matches. Ineligible files are never read, so they appear in neither
 * `filesScanned` nor `filesSkipped` — they are counted in `stats.filesIgnored`.
 *
 * `.d.ts` is rejected explicitly: it ends in `.ts` but carries no logic, so a
 * declaration clone class would be a guaranteed false positive under the
 * spec's own audit rejection criteria.
 *
 * Extensions are compared case-insensitively. A real `Foo.TS` exists on
 * case-insensitive macOS and Windows filesystems, and rejecting it on case
 * alone made it vanish from `filesScanned` and `filesSkipped` alike.
 *
 * The ignore globs are matched case-insensitively too (`nocase`), for the same
 * reason and against the same filesystems. Lowercasing only the extension
 * checks left the two halves disagreeing: `src/Foo.TEST.TS` passed the
 * extension test and then missed the default `*.test.ts` glob, so a test file
 * entered the index as production source — newly reachable BECAUSE the
 * extension check was made case-insensitive. `NODE_MODULES/pkg/a.js` and
 * `src/Dist/a.js` bypassed their directory globs the same way.
 *
 * A path that escapes `rootDir` is rejected outright, and so is an ABSOLUTE
 * one. `**`-anchored globs do not match a `../`-prefixed path, so such a file
 * bypassed EVERY default ignore pattern (`'src/index.ts'` was ignored while
 * `'../../x/index.ts'` was not), and `CloneMember.file` would then contradict
 * its own repo-relative contract. `rootDir` defaults to `process.cwd()`, so a
 * caller running from a directory deeper than its sources hits this easily.
 *
 * The absolute case is the Windows limb of the same hole: `path.relative`
 * returns an ABSOLUTE path when its two arguments sit on different drives
 * (`C:\root` to `D:\x\y.ts` yields `D:/x/y.ts` once POSIX-normalized), which
 * neither starts with `../` nor fails the extension test, so it was eligible
 * and `CloneMember.file` violated its own contract. Both the POSIX and the
 * win32 predicates are applied on every platform: the repo-relative contract
 * is the same everywhere, and a path produced on Windows can be analyzed
 * elsewhere.
 */
export function isEligibleFile(relPath: string, ignorePatterns: readonly string[]): boolean {
  if (relPath === '..' || relPath.startsWith('../')) return false;
  if (pathPosix.isAbsolute(relPath) || pathWin32.isAbsolute(relPath)) return false;
  const lower = relPath.toLowerCase();
  if (lower.endsWith('.d.ts')) return false;
  if (!SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;
  return !ignorePatterns.some((pattern) =>
    minimatch(relPath, pattern, { dot: true, nocase: true })
  );
}

/** One fingerprinted unit: its digest, token count, and located member. */
export interface FingerprintedUnit {
  fingerprint: string;
  tokenCount: number;
  member: CloneMember;
}

/**
 * A compact `reason x count` summary for the all-files-skipped error message.
 *
 * Counted as skips happen rather than derived from `skipped`, so the breakdown
 * stays exact once that array hits {@link MAX_EVIDENCE_ENTRIES}.
 */
function summarizeSkips(counts: ReadonlyMap<FileSkipReason, number>): string {
  return [...counts].map(([reason, count]) => `${count} ${reason}`).join(', ');
}

/**
 * Suggestions for the all-files-skipped error, keyed to the reasons actually
 * observed.
 *
 * A fixed list advised "Check file permissions" and "Check that the discovered
 * files are valid TS/JS" for EVERY cause, including an `internal-error` where
 * the files are fine and our own normalization or digest stage failed — e.g. a
 * FIPS-mode Node rejecting sha1.
 */
function skipSuggestions(
  reasons: ReadonlyMap<FileSkipReason, number>,
  skipped: readonly SkippedFile[]
): string[] {
  const suggestions: string[] = [];
  if (reasons.has('internal-error')) {
    suggestions.push(
      "Duplication's own normalization or digest stage failed — suspect the runtime, not the sources (e.g. a FIPS-mode Node where createHash('sha1') throws)"
    );
  }
  if (reasons.has('unreadable')) {
    suggestions.push('Check file permissions on the discovered source files');
  }
  if (reasons.has('unparseable')) {
    suggestions.push('Check that the discovered files are valid TS/JS that the parser accepts');
  }
  if (reasons.has('unextractable')) {
    suggestions.push('Check that the files parse to an AST carrying loc and range');
  }
  const first = skipped[0];
  if (first !== undefined) {
    suggestions.push(`First failure: ${first.file} — ${first.errorName}: ${first.message}`);
  }
  return suggestions;
}

/**
 * Why a file produced no units.
 *
 * The first three are statements about the FILE: it could not be read, the
 * parser rejected it, or its units could not be extracted from the resulting
 * AST. `unextractable` exists because `extractUnits` throws
 * {@link MissingNodeLocationError} on an AST without `loc` or `range`, and
 * that stage used to sit OUTSIDE the `try`, so the documented "never throws"
 * contract held only by accident.
 *
 * `internal-error` is NOT a statement about the file: it means OUR code or the
 * environment failed after a successful parse — normalization or the digest.
 * The concrete case is a FIPS-mode Node where `createHash('sha1')` throws:
 * EVERY file then failed, and with one shared reason the all-files-skipped
 * error advised "Check file permissions" and "Check that the discovered files
 * are valid TS/JS", which is actively misleading for an environment failure.
 * Keeping the two distinguishable is what lets the advice be right.
 */
export type FileSkipReason = 'unreadable' | 'unparseable' | 'unextractable' | 'internal-error';

/** Outcome of fingerprinting one file. */
export type FingerprintFileResult =
  | {
      status: 'scanned';
      units: FingerprintedUnit[];
      /** Units dropped before hashing for falling below `minTokens`. */
      unitsBelowMinTokens: number;
    }
  | {
      status: 'skipped';
      reason: FileSkipReason;
      message: string;
      /** The underlying error's `name`. */
      errorName: string;
      /** The underlying error, carried so the caller can record it. */
      originalError: Error;
    };

/** One skip outcome, carrying the error rather than flattening it to a string. */
function skipFile(reason: FileSkipReason, error: Error): FingerprintFileResult {
  return {
    status: 'skipped',
    reason,
    message: error.message,
    errorName: error.name,
    originalError: error,
  };
}

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
 * Never throws: a file that cannot be read, parsed or extracted — and a
 * normalization or digest failure, which is OUR failure rather than the
 * file's — resolves to `{ status: 'skipped' }`, carrying the reason and the
 * `Error` itself, so the caller can record it in `CloneIndex.skipped`,
 * increment `filesSkipped`, and continue. Phase 2's detector converts each
 * recorded skip into an `AnalysisError` with `analyzer: 'duplication'`; the
 * entropy types live there, not here, which is why the reason and message are
 * carried on the index rather than collapsed into a count.
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
    return skipFile('unreadable', contentResult.error);
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
    return skipFile('unparseable', e as Error);
  }

  // Extraction, normalization, and digest are all guarded: the "never throws"
  // contract above covers the whole function, and only `parse` used to be
  // inside a try. They are guarded SEPARATELY because they fail for different
  // reasons — extraction blames the AST, normalization and the digest blame us
  // or the environment (see {@link FileSkipReason}).
  const tokens = program.tokens ?? [];
  let extracted: ReturnType<typeof extractUnitsImpl>;
  try {
    extracted = extractUnitsImpl(program);
  } catch (e) {
    return skipFile('unextractable', e as Error);
  }

  const units: FingerprintedUnit[] = [];
  let unitsBelowMinTokens = 0;
  try {
    for (const unit of extracted) {
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
  } catch (e) {
    return skipFile('internal-error', e as Error);
  }
  return { status: 'scanned', units, unitsBelowMinTokens };
}

/**
 * Build a Type-1/2 clone index over `files`.
 *
 * One parse per file, one digest per unit, one `Map` grouping pass — there is
 * no member-against-member comparison, so nothing here is quadratic in the
 * number of units across the repository.
 *
 * Per FILE, however, the cost is O(units x tokens), not linear in tokens:
 * {@link fingerprintFile} calls `normalizeTokens(tokens, unit.range)` once per
 * unit and each call rescans that file's ENTIRE token array. Measured over
 * the measured scope (see {@link FingerprintCollision}), that is 26.0M token
 * visits against 1.40M tokens — 18.6x, re-measured unchanged at HEAD —
 * concentrated in the largest files: the worst,
 * `orchestrator/src/orchestrator.ts`, has 221 units over 22,648 tokens, so
 * 5,005,208 visits by itself.
 *
 * `program.tokens` is range-sorted, so a binary search for each unit's range
 * would make this linear. That optimization is deliberately deferred to Phase
 * 2, where the `<10s` success criterion lives and can measure it.
 *
 * Discovery is the caller's: `files` is a list of absolute paths, so nothing
 * here assumes any repository layout (success criterion 15). Ineligible paths
 * (unsupported extension, absolute, outside `rootDir`, or matched by
 * `ignorePatterns`) are dropped before any read; they are counted in
 * `stats.filesIgnored` and in neither `filesScanned` nor `filesSkipped`.
 *
 * A file that was eligible but failed resolves to a {@link SkippedFile} entry
 * on `skipped`, carrying the reason and the underlying message. A partial skip
 * returns `Ok`; a run where EVERY eligible file was skipped returns `Err`,
 * because at 100% skip the result is indistinguishable from the zero-discovery
 * case this function already refuses.
 *
 * `EntropyError.code` is NOT a discriminator: `PARSE_ERROR` is shared across
 * distinct conditions — `'all-files-skipped'` here, and the per-file
 * `'unparseable'` / `'internal-error'` skips Phase 2 is specified to convert
 * into `AnalysisError`s — besides being raised by unrelated entropy modules.
 * Consumers must switch on `details.reason`, never on `code`.
 *
 * Grouping is keyed on `${fingerprint}:${tokenCount}`, so two units whose
 * digests collide while their stream lengths differ cannot form a class
 * together. Such a pair is recorded on `collisions` and counted in
 * `stats.collisionsObserved` instead of failing the scan — see
 * {@link FingerprintCollision}, including what that record cannot see.
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
  let filesIgnored = 0;
  for (const abs of files) {
    const rel = relativePosix(rootDir, abs);
    if (isEligibleFile(rel, config.ignorePatterns)) eligible.push({ abs, rel });
    // Counted, not merely dropped: a silent drop is indistinguishable from a
    // file that was read and held no duplication.
    else filesIgnored += 1;
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
  let collisionsObserved = 0;
  // Counts are exact; the arrays below them are capped evidence samples.
  const skipReasons = new Map<FileSkipReason, number>();
  const skipped: SkippedFile[] = [];
  const collisions: FingerprintCollision[] = [];
  // First unit seen per digest, so a later length disagreement under the same
  // digest can be reported with BOTH locations rather than just the second.
  const firstByFingerprint = new Map<string, FingerprintedUnit>();
  // Keyed on `${fingerprint}:${tokenCount}` — see the grouping note below.
  const groups = new Map<string, FingerprintedUnit[]>();

  for (const { abs, rel } of eligible) {
    const outcome = await fingerprintFile(abs, rel, config.minTokens);
    if (outcome.status === 'skipped') {
      filesSkipped += 1;
      skipReasons.set(outcome.reason, (skipReasons.get(outcome.reason) ?? 0) + 1);
      if (skipped.length < MAX_EVIDENCE_ENTRIES) {
        skipped.push({
          file: rel,
          reason: outcome.reason,
          message: outcome.message,
          errorName: outcome.errorName,
          originalError: outcome.originalError,
        });
      }
      continue;
    }
    filesScanned += 1;
    unitsBelowMinTokens += outcome.unitsBelowMinTokens;
    for (const unit of outcome.units) {
      unitsFingerprinted += 1;
      const first = firstByFingerprint.get(unit.fingerprint);
      if (first === undefined) {
        firstByFingerprint.set(unit.fingerprint, unit);
      } else if (first.tokenCount !== unit.tokenCount) {
        // Observed, not raised: the composite key below already keeps these
        // two out of one another's class, so there is nothing to fail over.
        collisionsObserved += 1;
        if (collisions.length < MAX_EVIDENCE_ENTRIES) {
          collisions.push({
            fingerprint: unit.fingerprint,
            members: [first.member, unit.member],
            tokenCounts: [first.tokenCount, unit.tokenCount],
          });
        }
      }
      const key = `${unit.fingerprint}:${unit.tokenCount}`;
      const bucket = groups.get(key);
      if (bucket === undefined) groups.set(key, [unit]);
      else bucket.push(unit);
    }
  }

  // A run where every eligible file failed is not a scan that found nothing:
  // it is a scan that did not happen. At 100% skip the result is
  // indistinguishable from the zero-discovery case the guard above exists to
  // refuse, so it gets the same treatment. A partial skip (1 of N) still
  // returns Ok with the skips recorded — that IS a scan that happened.
  if (filesScanned === 0) {
    return Err(
      createEntropyError(
        'PARSE_ERROR',
        `Refusing to report a pass over zero readable source files: all ${filesSkipped} eligible file(s) under ${rootDir} were skipped (${summarizeSkips(skipReasons)}).`,
        {
          reason: 'all-files-skipped',
          file: rootDir,
          issues: skipped,
          originalError: skipped[0]!.originalError,
        },
        skipSuggestions(skipReasons, skipped)
      )
    );
  }

  // Every unit that reached grouping already cleared minTokens, so the only
  // remaining bar is minInstances. A group of >= 2 members that fails it is
  // suppressed; a singleton group is not duplication and is counted nowhere.
  //
  // Each bucket is keyed on BOTH the digest and the token count, so every
  // member of a bucket agrees on `tokenCount` by construction — reading it off
  // `units[0]` is sound without a check, and a length-differing collision
  // cannot put two unrelated units in one class in the first place. The
  // previous revision grouped on the digest alone and then returned `Err` on a
  // disagreement, which discarded every other valid class, the stats and the
  // `byMember` seam to avoid one spurious member in an advisory-first detector
  // (D4; the fail-closed #855 gate is the standing precedent against that).
  const qualifying: CloneClass[] = [];
  let classesSuppressed = 0;
  for (const units of groups.values()) {
    if (units.length < 2) continue;
    if (units.length < config.minInstances) {
      classesSuppressed += 1;
      continue;
    }
    const { fingerprint, tokenCount } = units[0]!;
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
    skipped,
    collisions,
    stats: {
      filesScanned,
      filesIgnored,
      filesSkipped,
      skippedTruncated: filesSkipped - skipped.length,
      unitsFingerprinted,
      unitsBelowMinTokens,
      classesReported: classes.length,
      classesSuppressed,
      classesTruncated,
      collisionsObserved,
      collisionsTruncated: collisionsObserved - collisions.length,
    },
  });
}
