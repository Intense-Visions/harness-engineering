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
import { collectFileImports, usedImportKeys, sharedImportKey } from './imports';

export type { CloneUnitKind, DupUnit } from './units';
export { extractUnits, MissingNodeLocationError } from './units';
export {
  normalizeTokens,
  fingerprintStream,
  IDENTIFIER_PLACEHOLDER,
  LITERAL_PLACEHOLDER,
} from './tokens';
export type { FileImports } from './imports';
export { moduleKey, collectFileImports, usedImportKeys, sharedImportKey } from './imports';

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
  /**
   * `tokenCount * members.length` — the SIZE of the duplication, and nothing
   * else. Unchanged by the signal, so a consumer can read it as "tokens x
   * copies" for any class (#1612 / #1646 bind to it as a magnitude).
   */
  rank: number;
  /**
   * The ORDERING key: `rank`, times
   * {@link PARTIAL_EXTRACTION_PRIORITY_BOOST} when
   * `signal === 'partial-extraction'`.
   *
   * `classes` is sorted by this and the `maxClasses` cap keeps the top
   * `maxClasses` by this (spec criterion 13). It equals `rank` for every plain
   * duplicate, so a project with no partial-extraction class sees exactly the
   * pre-Phase-4 order. Published rather than kept private because a consumer
   * handed a reordered list must be able to derive the order from the payload.
   */
  priority: number;
  /**
   * `'partial-extraction'` when EVERY member's unit body references a value
   * binding imported from one common first-party module — a half-done
   * extraction, where the shared helper already exists and only the wrapper
   * layer stayed duplicated. `'duplicate'` otherwise.
   *
   * All four conditions are load-bearing and each is earned by measurement in
   * `./imports.ts`: module IDENTITY rather than raw specifier strings, the
   * reference inside the unit BODY rather than anywhere in the file, VALUE
   * imports only, and FIRST-PARTY modules only. The spec's original
   * file-level wording labels 89 of this repository's 96 reported classes
   * (92.7%), including all 38 platform-mirror classes whose four copies share
   * an import list by construction; the shipped predicate labels 10, none of
   * them a mirror.
   */
  signal: 'duplicate' | 'partial-extraction';
  /**
   * The shared module's repo-relative, extensionless key — set only when
   * `signal === 'partial-extraction'`, and ABSENT rather than
   * present-and-`undefined` otherwise.
   *
   * A KEY, not a file path: it is derived without touching the filesystem, so
   * claiming a file exists would be a claim the derivation never checked. When
   * a class shares more than one module the lexicographically smallest key
   * wins, so the published value never depends on file-discovery order.
   */
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
  /**
   * Qualifying classes, PRIORITY-descending (`CloneClass.priority`), capped at
   * `maxClasses`. `priority` equals `rank` for every plain duplicate, so this
   * is rank-descending for any project with no labelled class.
   */
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
  /**
   * Report cap; the top `maxClasses` by `CloneClass.priority` survive
   * (criterion 13). Default 100.
   */
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
 * Extensions parsed with `jsx: true`: every supported one EXCEPT `.ts`.
 *
 * `.ts` is excluded because TypeScript itself forbids JSX there (`<T>x` is a
 * type assertion in `.ts`, which is why `.tsx` exists), so enabling the flag
 * would break real files.
 *
 * `.js` / `.mjs` / `.cjs` are included for adopter portability, which is the
 * whole reason this list exists instead of a two-extension check. In a CRA- or
 * Next-style project JSX in `.js` is the DEFAULT, and with `jsx: false` such a
 * component throws `TSError: '>' expected` — measured — so every component
 * file was skipped as `unparseable` and told to "check the file is valid
 * TypeScript/JavaScript for its extension". It is valid for its ecosystem; the
 * parser flag was wrong. A `src/` of such files tripped the
 * all-files-skipped `Err` and the detector refused to run at all.
 *
 * Measured free before enabling, because `jsx: true` changes how `<` is
 * parsed: over every `.js` / `.mjs` / `.cjs` file this detector scans in this
 * repository — 73 at the entropy detector's scope, 20 at the spec's
 * `packages/`-only scope, including the vendored Vite dependency pre-bundles —
 * parsing with the flag on yields BYTE-IDENTICAL unit fingerprints, token
 * counts and unit names, with no file newly failing to parse and none newly
 * parsing. The reported class counts are unchanged at both scopes (98 and 58).
 * This is safe because JSX is only attempted where an expression may START;
 * `a < b` keeps `<` in binary-operator position.
 *
 * Matched case-insensitively, like {@link SUPPORTED_EXTENSIONS}: `View.JSX` is
 * eligible on a case-insensitive filesystem, and a case-sensitive check parsed
 * it WITHOUT the flag — the same split-brain the extension check already fixed.
 */
const JSX_CAPABLE_EXTENSIONS = ['.tsx', '.jsx', '.js', '.mjs', '.cjs'] as const;

/** True when `relPath`'s extension should be parsed with `jsx: true`. */
function isJsxCapable(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  return JSX_CAPABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

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

/**
 * How much a `partial-extraction` class outweighs a plain duplicate of the
 * same size (spec decision D8, "rank partial-extraction above plain
 * duplication").
 *
 * A POLICY constant, deliberately separate from `rank`: a half-extracted class
 * is the cheapest fix on the page, because the shared module already exists
 * and the refactor is delete-and-import rather than design.
 *
 * Measured over this repository's 96 reported classes when this landed: at 2,
 * six of the printed top ten are labelled, the mirror rows on that page fall
 * from four to two, and the spec's named `parseFencedJson` case rises from #21
 * to #9 — while the largest clone in the repository stays visible at #2. A
 * strict tier (every labelled class first) instead fills all ten printed rows
 * and pushes that largest clone off the page entirely.
 */
export const PARTIAL_EXTRACTION_PRIORITY_BOOST = 2;

/**
 * Sort order WITHIN a priority tie: a labelled class ahead of a plain one.
 *
 * D8's sentence is about order, not about the multiplier, so at a tie it has to
 * hold on its own. See the comparator in {@link buildCloneIndex}.
 */
const SIGNAL_ORDER: Record<CloneClass['signal'], number> = {
  'partial-extraction': 0,
  duplicate: 1,
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

/**
 * Merge partial options over the defaults.
 *
 * The returned config is a fresh MUTABLE object with a fresh `ignorePatterns`
 * array, so a consumer may adjust its own copy; the frozen
 * {@link DEFAULT_DUPLICATION_CONFIG} is unreachable from it.
 *
 * This is a MERGE, not a validator, and it cannot become one: it returns a
 * `DuplicationConfig`, not a `Result`, so the only ways to reject a bad value
 * here are to throw (which is what this module refuses to do) or to drop it
 * silently (which would mean an exclusion the operator asked for never
 * happens, and the files they excluded get reported). Validation therefore
 * lives at the {@link buildCloneIndex} boundary, which has a `Result` to
 * return — see {@link findInvalidIgnorePattern}.
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
 * The first `ignorePatterns` entry `minimatch` cannot accept, with its index.
 *
 * `minimatch` THROWS `TypeError: invalid pattern` on any non-string —
 * measured here for `null`, `undefined`, `42`, `{}` and `[]` — and the
 * eligibility loop in {@link buildCloneIndex} is the one loop in this module
 * that sits outside every `try`. `DuplicationConfig.ignorePatterns` is typed
 * `readonly string[]`, but the config reaches this module from
 * `EntropyConfig.analyze.duplication`, which an adopter populates from
 * UNTYPED `harness.config.json`, so the type is not a guarantee at runtime.
 *
 * Why that mattered enough to validate rather than document: a throw out of
 * `buildCloneIndex` escapes `detectDuplication` and `EntropyAnalyzer.analyze`
 * (which holds no `try` of its own), so one malformed glob took down drift,
 * dead-code, patterns, complexity, coupling and size-budget with it. That is
 * fail-closed behavior from the detector whose headline decision (spec D4) is
 * that it never fails closed. Returning `Err` degrades duplication alone: the
 * analyzer records it as an `AnalysisError` and every sibling still reports.
 *
 * An EMPTY string is deliberately NOT rejected. Measured: `minimatch(path,
 * '')` returns `false` for every path, so an empty pattern excludes nothing
 * and cannot hide a file — refusing to scan over one would be fail-closed
 * behavior on an inert typo. `tests/duplication/failure-behavior.test.ts`
 * pins that it neither throws nor empties the index.
 *
 * `EntropyConfig.exclude` carries the same hazard into `buildSnapshot`
 * (`entropy/snapshot.ts` matches it with no type guard and outside any
 * `try`). That one is pre-existing and out of this change's scope; it is named
 * here so the asymmetry is a known gap rather than an accident. Duplication no
 * longer shares it.
 */
function findInvalidIgnorePattern(
  patterns: readonly string[]
): { index: number; value: unknown } | undefined {
  for (let index = 0; index < patterns.length; index++) {
    const value: unknown = patterns[index];
    if (typeof value !== 'string') return { index, value };
  }
  return undefined;
}

/**
 * Render a rejected pattern for an error message.
 *
 * `JSON.stringify` returns `undefined` for `undefined`, a function and a
 * symbol, and throws on a `BigInt` or a circular object, so each of those is
 * handled before it — the message must name what it rejected, and
 * `String(value)` on an `unknown` is both lint-rejected and liable to print
 * `[object Object]`.
 */
function describePattern(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'a function';
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'bigint') return `${value}n`;
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  } catch {
    // Circular, or a BigInt nested inside: fall through to the type tag.
  }
  return Object.prototype.toString.call(value);
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

/**
 * One fingerprinted unit: its digest, token count, located member, and the
 * first-party module keys its BODY references.
 *
 * `importKeys` is empty for a unit that references no first-party import —
 * the overwhelmingly common case, and the reason this is a required array
 * rather than an optional field: absent and "none" are the same statement
 * here, and a required field cannot be forgotten by a future producer.
 */
export interface FingerprintedUnit {
  fingerprint: string;
  tokenCount: number;
  member: CloneMember;
  importKeys: readonly string[];
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
      jsx: isJsxCapable(relPath),
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
    // Inside the same `try` that yields `'internal-error'`: import collection
    // is OUR code reading an already-parsed Program, not the file's syntax, so
    // it is classified with normalization and the digest rather than with
    // extraction (see {@link FileSkipReason}).
    const fileImports = collectFileImports(program, relPath);
    for (const unit of extracted) {
      const stream = normalize(tokens, unit.range);
      if (stream.length < minTokens) {
        unitsBelowMinTokens += 1;
        continue;
      }
      units.push({
        fingerprint: digest(stream),
        tokenCount: stream.length,
        importKeys: usedImportKeys(fileImports, unit.range),
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
 * Per FILE the cost is linear in that file's tokens, NOT O(units x tokens):
 * {@link fingerprintFile} calls `normalizeTokens(tokens, unit.range)` once per
 * unit, and that function binary-searches `program.tokens` (range-sorted) for
 * the unit's window instead of rescanning the file's whole token array. A
 * token inside a nested unit is still read once per enclosing unit, so the
 * honest claim is linear in the source times nesting depth — which is what the
 * measured ~1.2x below is, not a bare 1.0x.
 *
 * Every figure here carries its SCOPE and its DENOMINATOR. This module's cost
 * was understated 8x in three places by omitting the first, and by 6% by
 * leaving the second implicit, so both are now stated rather than assumed.
 * Re-measured at this change's HEAD:
 *
 *   - At THIS DETECTOR's scope (the repository's non-test sources: 2,153
 *     eligible files, 17,064 units, 1,605,885 tokens): 1,976,826 token visits,
 *     1.23x the token count — down from 214,130,152 visits (133.3x) when every
 *     unit rescanned its file. A 108x reduction.
 *   - At the spec Evidence section's scope (`packages/` only: 2,065 files,
 *     13,402 units, 1,400,920 tokens): 1,625,558 visits, 1.16x — down from
 *     26,055,026 (18.6x). A 16x reduction.
 *
 * Those two pre-fix figures differ 8x for the same code because the quadratic
 * term was dominated by whichever single pathological file was in scope. At the
 * detector's scope, two vendored Vite dependency pre-bundles under
 * `docs/.vitepress/cache/` cost 93,413,136 visits (43.6% of the scope) and
 * 81,613,016 (38.1%) by themselves — 81.7% of the entire pre-fix cost between
 * two files. At `packages/` scope the worst file is
 * `orchestrator/src/orchestrator.ts`: 221 units over 22,648 tokens = 5,005,208
 * visits, 19.2%.
 *
 * The denominator: the ratios above divide by the tokens in ALL eligible
 * files, since every one of them is parsed. Dividing instead by the tokens in
 * only the files that yielded at least one unit (1,519,596 over 1,646 files at
 * the detector's scope; 1,316,878 over 1,577 at `packages/`) gives 140.9x pre
 * and 1.30x post, and 19.8x pre and 1.23x post, respectively. Same
 * measurements, different question — Phase 2's notes used the second
 * denominator while this JSDoc used the first, and neither said so.
 *
 * The guard against a reversion is deterministic and lives in
 * `tests/entropy/detectors/duplication.perf.test.ts`: a token-visit bound,
 * which the reverted implementation blows by two orders of magnitude (496,800
 * visits against a 6,480 bound). There is deliberately no wall-clock
 * assertion; that accepted gap is recorded in the spec's verification notes.
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
 * A malformed `ignorePatterns` entry returns `Err` with
 * `details.reason: 'invalid-ignore-pattern'`, naming the offending index. That
 * is the third `Err` and the reason this function — not
 * `resolveDuplicationConfig` — is the validating boundary: `minimatch` throws
 * on a non-string pattern and nothing between here and
 * `EntropyAnalyzer.analyze()` catches it. See
 * {@link findInvalidIgnorePattern}.
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

  // Validate BEFORE the eligibility loop, not inside it: a `minimatch` throw
  // on the first file would otherwise escape this function entirely. See
  // {@link findInvalidIgnorePattern} for why that is a D4 violation and not
  // just an ugly stack trace.
  const invalid = findInvalidIgnorePattern(config.ignorePatterns);
  if (invalid) {
    return Err(
      createEntropyError(
        'INVALID_CONFIG',
        `duplication.ignorePatterns[${invalid.index}] is ${describePattern(invalid.value)}, not a glob string; minimatch rejects every non-string pattern.`,
        { reason: 'invalid-ignore-pattern' },
        [
          `Remove or quote duplication.ignorePatterns[${invalid.index}] — every entry must be a minimatch glob string, e.g. "**/generated/**"`,
          'A null or numeric entry usually comes from hand-edited harness.config.json, where the readonly string[] type is not enforced',
        ]
      )
    );
  }

  const eligible: Array<{ abs: string; rel: string }> = [];
  let filesIgnored = 0;
  try {
    for (const abs of files) {
      const rel = relativePosix(rootDir, abs);
      if (isEligibleFile(rel, config.ignorePatterns)) eligible.push({ abs, rel });
      // Counted, not merely dropped: a silent drop is indistinguishable from a
      // file that was read and held no duplication.
      else filesIgnored += 1;
    }
  } catch (e) {
    // Belt and braces. The type check above covers the one throw cause
    // measured out of `minimatch`, but this loop is the module's only
    // unguarded one and `minimatch` is third-party: a future version (or a
    // pathological but well-typed pattern) rejecting something else must
    // still degrade to `Err` rather than take the whole entropy run down.
    // No pattern is named here because the thrower is not knowable from
    // `.some()` — honest advice beats a guessed index.
    return Err(
      createEntropyError(
        'INVALID_CONFIG',
        `duplication discovery failed while matching ${config.ignorePatterns.length} ignore pattern(s): ${(e as Error).message}`,
        { reason: 'invalid-ignore-pattern', originalError: e as Error },
        [
          'Check every duplication.ignorePatterns entry is a valid minimatch glob',
          'Bisect by running with duplication.ignorePatterns: [] and re-adding patterns',
        ]
      )
    );
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
    // D8, as MEASURED rather than as first written: the spec's file-level
    // sentence ("every member's file imports a common module") labels 89 of
    // this repository's 96 classes, 38 of them platform mirrors whose four
    // copies share an import list by construction. The predicate that ships
    // is the body-level, first-party, value-only one — 10 of 96 — and it is
    // documented in `imports.ts`, where each condition is earned separately.
    const sharedImport = sharedImportKey(units.map((unit) => unit.importKeys));
    const signal: CloneClass['signal'] =
      sharedImport === undefined ? 'duplicate' : 'partial-extraction';
    const rank = tokenCount * members.length;
    qualifying.push({
      fingerprint,
      tokenCount,
      members,
      rank,
      priority: signal === 'partial-extraction' ? rank * PARTIAL_EXTRACTION_PRIORITY_BOOST : rank,
      signal,
      // Spread, never `sharedImport: undefined`: a plain duplicate's key set
      // is pinned by the barrel suite, and a present-but-undefined key is a
      // different object on the wire (`JSON.stringify` drops it, `Object.keys`
      // does not).
      ...(sharedImport !== undefined && { sharedImport }),
    });
  }

  // Priority-descending, then SIGNAL, then fingerprint, then tokenCount: four
  // keys, each deciding only what the ones before it left tied, so the reported
  // order never depends on filesystem or input ordering.
  //
  // `signal` is here because the boost creates a tie family the published
  // decision did not cover. A labelled class of rank r ties a plain class of
  // rank 2r — and at that tie D8 ("rank partial-extraction above plain
  // duplication") was being decided by `fingerprint.localeCompare`, i.e. by
  // sha1 hex, which put the labelled class BELOW the plain ones as often as
  // not. It was live on this repository at the 10-label predicate: three plain
  // classes and one labelled class all at priority 432, the labelled one
  // sorting last. The tightened predicate (7 labels) leaves no such tie live
  // here, which is exactly why the term is load-bearing rather than
  // decorative — the next project to produce one must not rediscover it.
  //
  // `fingerprint` alone no longer identifies a class: two classes can share a
  // digest and differ in `tokenCount` (that IS an observed collision), and
  // their priorities can still tie — 10 tokens x 6 members equals 20 x 3, and
  // the boost scales both sides of that equality rather than breaking it.
  qualifying.sort(
    (a, b) =>
      b.priority - a.priority ||
      SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal] ||
      a.fingerprint.localeCompare(b.fingerprint) ||
      a.tokenCount - b.tokenCount
  );
  const classes = qualifying.slice(0, config.maxClasses);
  const classesTruncated = qualifying.length - classes.length;

  // byMember: first writer wins, iterating priority-descending, so an ambiguous
  // `${file}:${startLine}` key (a function and a nested arrow can share a
  // line) resolves deterministically to the highest-PRIORITY owning class.
  // A labelled class therefore wins such a key over a larger plain duplicate,
  // which is the same precedence the printed report shows.
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
