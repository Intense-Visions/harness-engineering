/**
 * Sibling resolution — the seam that answers CODE-R004's own question.
 *
 * `abstraction-earns-keep` (CODE-R004) names the Rule of Three verbatim ("the
 * same five lines copied in three places crying out for one named home") while
 * `CritiqueInput` carries ONE unit's source span and no cross-file channel.
 * Asking a model whether five lines appear in three places while showing it one
 * place is not a hard judgment call, it is an impossible one. This module turns
 * `CloneIndex.byMember` — core's `${file}:${startLine}` -> owning class map —
 * into the evidence that clause needs.
 *
 * Source: docs/changes/duplication-detection/proposal.md (Phase 5).
 */

import * as path from 'node:path';
import { buildCloneIndex } from '@harness-engineering/core';
import type { CloneClass, CloneIndex, CloneMember } from '@harness-engineering/core';
import { discoverSourceFiles } from './discover.js';
import type { CodeUnit } from '../findings/schema.js';

/**
 * Start-line probe offsets, exact-first.
 *
 * The spec mandates a ±2 tolerance for the named risk that `typescript`'s
 * `node.getStart(sf)` and estree's `loc.start.line` disagree. **This tolerance
 * is LOAD-BEARING TODAY — do not delete it as dead code.**
 *
 * A DECORATED CLASS is the live case. `typescript`'s `getStart` lands on the
 * `class` keyword, while `typescript-estree` includes a class decorator in
 * `ClassDeclaration.loc.start` — so `@Dec()` on its own line gives code-craft
 * line 3 and estree line 4 for the same class, and the exact key MISSES. (The
 * two parsers agree on METHODS, whose decorators both include.) An exact-only
 * matcher silently drops every decorated class from the clone join, which
 * means no sibling evidence for exactly the adopters most likely to have
 * duplication: Angular, NestJS, TypeORM, MobX. `extractor-agreement.test.ts`
 * pins this ("the decorated class is rescued BY the +/-2 tolerance, not despite
 * it"), and mutant `START_LINE_PROBE_ORDER -> [0]` kills three tests.
 *
 * Measured at Scope D (2,066 files / 7,880 code-craft units) the parsers agree
 * 7,880/7,880 and this tolerance contributes zero true positives — and the two
 * candidates it does produce are both wrong (a one-line arrow at
 * `brand/index.ts:167` matching `collectFiles` at 165). **That zero is
 * CORPUS-SPECIFIC and says nothing about the construct:** this repository
 * contains ZERO TypeScript decorators, so Scope D never exercised the one
 * divergence the tolerance exists for. A figure measured over a corpus that
 * lacks the construct is not evidence about the construct.
 *
 * Safe because every candidate is gated by {@link spanAgrees} — the probe
 * widens the search, the span co-check decides. Exact first so the common case
 * costs one Map lookup.
 */
const START_LINE_PROBE_ORDER: readonly number[] = [0, -1, 1, -2, 2];

/** Max `endLine` drift tolerated when confirming a candidate is the SAME unit. */
const SPAN_TOLERANCE = 2;

/** What the critique prompt needs about a unit's clone class. */
export interface SiblingEvidence {
  /**
   * The OTHER locations sharing this unit's normalized token shape.
   *
   * Every member at the matched `${file}:${startLine}` key is excluded, not just
   * the unit itself. The key is lossy by construction — a function and a nested
   * arrow, or a one-line `const K = class { m() {} }`, collapse onto one key —
   * and two units at one location are ONE location to a reader following a
   * `file:line` pointer. Showing the queried line back as a "sibling" would be
   * noise at best and a false third copy at worst.
   */
  siblings: CloneMember[];
  /** The owning class, for `tokenCount` / `signal` / `sharedImport`. */
  siblingClass: CloneClass;
}

/**
 * Resolve one `code-craft` unit against the clone index, or `undefined`.
 *
 * Matches on `(file, startLine)` and NEVER on `kind`. The two extractors
 * disagree on `kind` for 139 of 7,880 units at Scope D — all one shape, all one
 * direction: `code-craft`'s `asFunctionLike` promotes an object-literal property
 * (`{ run: (x) => {…} }`) to `'method'`, while core's `UNIT_KINDS` maps
 * `ArrowFunctionExpression` and `FunctionExpression` to `'function'`
 * unconditionally. Matching on `(file, kind, startLine)` as the spec originally
 * mandated would silently drop 1.76% of lookups; criterion 5 is restated
 * accordingly and `tests/code-craft/extractor-agreement.test.ts` pins the
 * divergence so a change to either mapping goes red.
 */
export function resolveSiblingEvidence(
  index: CloneIndex,
  projectRoot: string,
  file: string,
  unit: CodeUnit
): SiblingEvidence | undefined {
  const rel = toRelativePosix(projectRoot, file);
  for (const offset of START_LINE_PROBE_ORDER) {
    const startLine = unit.line + offset;
    const siblingClass = index.byMember.get(`${rel}:${startLine}`);
    if (siblingClass === undefined) continue;
    if (!spanAgrees(siblingClass, rel, startLine, unit.endLine)) continue;
    // No empty-list guard: `CloneClass.members.length >= minInstances` (>= 3 by
    // contract) and two distinct units cannot share one (file, startLine), so
    // self-exclusion always leaves at least one sibling. A guard here would be
    // an unreachable branch and an untestable one.
    return {
      siblings: siblingClass.members.filter((m) => !(m.file === rel && m.startLine === startLine)),
      siblingClass,
    };
  }
  return undefined;
}

/**
 * Does the owning class hold a member at this key whose span matches the unit?
 *
 * This is what makes the ±2 start tolerance safe rather than a false-positive
 * generator, and it is also the answer to the `byMember` key's lossiness: when a
 * one-line arrow and its enclosing function share a key, their `endLine`s
 * differ, so the index's first-writer-wins owner is accepted only for the unit
 * it actually describes. Measured at Scope D: costs 0 of 153 true hits
 * (`endLine` agrees 7,880/7,880) and rejects 2 of 2 false candidates.
 */
function spanAgrees(cls: CloneClass, rel: string, startLine: number, endLine: number): boolean {
  return cls.members.some(
    (m) =>
      m.file === rel && m.startLine === startLine && Math.abs(m.endLine - endLine) <= SPAN_TOLERANCE
  );
}

/**
 * Repo-relative POSIX path, mirroring core's `relativePosix`.
 *
 * `CloneMember.file` is built with core's `relativePosix(rootDir, abs)` and the
 * `byMember` key is built from it, so any divergence here is a 100% miss rate on
 * Windows rather than a subtle one. Core does not barrel-export `relativePosix`,
 * so the two-line implementation is mirrored verbatim rather than approximated
 * with `path.posix.relative` (which does not convert separators).
 */
function toRelativePosix(projectRoot: string, file: string): string {
  return path.relative(projectRoot, file).replaceAll('\\', '/');
}

/**
 * Build the clone index for one `code-craft` run, or `undefined`.
 *
 * Scope is the FULL project discovery — deliberately NOT `input.files`,
 * `input.packages` or `input.maxFiles`. Siblings live in other files by
 * definition and `DEFAULT_MAX_FILES` is 100, so an index over the critiqued set
 * could never form a 3-member class for a `--files one.ts` run, which is the
 * most common invocation. Reusing `discoverSourceFiles` (rather than core's
 * `findFiles` + `isEligibleFile`) means every unit code-craft critiques is
 * provably inside the indexed corpus, so a miss always means "no clone class"
 * and never "different scope". Measured at that scope: 2,066 files, 2.1-2.9 s,
 * 58 classes, 230 `byMember` keys, 153 of 7,880 substantive units hitting.
 *
 * `DEFAULT_DUPLICATION_CONFIG` (`minInstances: 3`, `minTokens: 40`) is taken as
 * given: `harness.config.json`'s `analyze.duplication` block is NOT read, so an
 * adopter who tunes the detector will not see `code-craft` follow. That is a
 * recorded assumption rather than an oversight, and the fix if it is wrong is
 * one option object here.
 *
 * Returns `undefined` on `Err` and on an empty discovery, and the reason is
 * DROPPED: `CodeCraftSummary` has no channel for it and the spec requires the
 * critique to degrade to current behaviour rather than fail. The honest cost is
 * that a failed index build is invisible to an operator — a filed follow-up,
 * because surfacing it changes `CodeCraftOutput`, the MCP response and the
 * printed page. What keeps the wiring falsifiable meanwhile is the end-to-end
 * assertion over `collectCodeCraftPrompts(...).pendingPrompts[].userPrompt`.
 */
export async function buildCodeCraftCloneIndex(
  projectRoot: string
): Promise<CloneIndex | undefined> {
  const files = discoverSourceFiles(projectRoot);
  // Returned before the call, not delegated to it: `buildCloneIndex([])`
  // answers `Err` (its refuse-to-pass-over-zero-files path), so the outcome
  // would be the same either way — but paying a module load and a config
  // resolution to learn there is nothing to scan is work with no question
  // behind it. `tests/code-craft/siblings.test.ts` asserts the call does not
  // happen, because without that assertion the guard is untestable: both paths
  // return `undefined`.
  if (files.length === 0) return undefined;
  const result = await buildCloneIndex(files, { rootDir: projectRoot });
  return result.ok ? result.value : undefined;
}
