// packages/cli/src/shared/craft/findings/clumpable.ts
//
// The CRAFT half of the creation seam (docs/changes/clumping/proposal.md,
// Phase 3): "a set of like findings becomes one work item rather than N",
// applied at the only boundary a craft run owns — EMISSION.
//
// Why emission and not filing: `craft-fleet` is a SKILL.md, not code. A craft
// run's findings become issues when an AGENT reads them and calls
// `manage_roadmap` (`mcp/tools/roadmap.ts:371`, one feature → one row → one
// issue). There is no code point between emission and filing to group at, so
// grouping happens in the output every one of those agents reads. That is
// honestly weaker than "files 1 issue" — it proves emission, not consumption —
// and the proposal's Phase 5 is what closes the gap by making craft-fleet read
// `clumps` instead of `findings`.
//
// ONE adapter for all eleven families, because all eleven findings carry the
// same three things this needs: a `CODE-R\d{3}`-shaped `code`, a `target.file`,
// and the ADR-0019 axis trio.

import {
  formClumps,
  type ClumpPolicy,
  type ClumpResult,
  type ClumpableItem,
} from '@harness-engineering/core';

import type { Confidence, Impact, Tier } from './axes.js';
import { derivePriority } from './derived.js';

/**
 * The slice of a craft finding this adapter reads — and nothing more.
 *
 * `cite` IS DELIBERATELY ABSENT, and that absence is the design.
 * Ten families declare `cite: { rubricId, source }`; design-craft declares
 * `cite: { rubricOrPatternId, source }` (`design-craft/findings/schema.ts:78`)
 * because its findings come from rubrics OR patterns. The obvious way to derive
 * a rubric family is `cite.rubricId.split('-')[0]`, and on design-craft that
 * reads `undefined` — in plain JS a `kind` of `"undefined"`, which would silently
 * fold every CRITIQUE and POLISH finding in the repo into one bogus group that
 * LOOKS like a working clump. So the family comes from `code`, which every
 * family declares identically, and `cite` is not part of this contract at all.
 * `clumpable.test.ts` pins design-craft's real `CraftFinding` shape mapping to
 * `CRAFT`, with the ten `rubricId` families as the positive control.
 *
 * `target.line` is optional because api / cli-ergonomics / docs / knowledge
 * findings have no line — their target is a whole file or surface.
 */
export interface CraftClumpableFinding {
  code: string;
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: { file: string; line?: number };
}

/**
 * The rubric family: the prefix of the finding code.
 *
 * `CODE-R004` → `CODE`, `CRAFT-P001` → `CRAFT`. Nothing in the finding schemas
 * exposes a family directly, so the code namespace is the only mechanical
 * source. A code with no hyphen is its own family rather than an error: an LLM
 * can emit a malformed code, and a thrown adapter would take the whole run's
 * findings down with it when the correct degrade is "this one groups alone".
 */
export function craftKind(code: string): string {
  const cut = code.indexOf('-');
  return cut === -1 ? code : code.slice(0, cut);
}

/**
 * The directory the finding lives in.
 *
 * Split on `/` explicitly rather than `path.dirname`: craft findings carry
 * project-relative POSIX paths, and `path.dirname` on win32 would additionally
 * split on `\`, so the same finding would produce a different scope per
 * platform and the emitted clump ids would differ between CI legs.
 */
export function craftScope(file: string): string {
  const cut = file.lastIndexOf('/');
  return cut === -1 ? '.' : file.slice(0, cut);
}

/**
 * Normalize one run's findings into the seam-neutral candidates core reads.
 *
 * Taken as a batch, not one at a time, because `ClumpableItem.id` MUST be
 * unique within a call (`formClumps` throws on a duplicate rather than collapse
 * two items) and a craft finding carries no id of its own. `code:file:line` is
 * the most identifying tuple available and it is NOT unique — two rubrics can
 * fire on two units declared on the same line of the same file — so an
 * occurrence ordinal disambiguates. The ordinal is a function of the findings
 * array, so the mapping stays deterministic for a given run.
 */
export function toClumpableItems(findings: readonly CraftClumpableFinding[]): ClumpableItem[] {
  const seen = new Map<string, number>();
  return findings.map((finding) => {
    const file = finding.target.file;
    const stem = `${finding.code}:${file}:${finding.target.line ?? '-'}`;
    const ordinal = seen.get(stem) ?? 0;
    seen.set(stem, ordinal + 1);
    return {
      id: `${stem}#${ordinal}`,
      scope: craftScope(file),
      kind: craftKind(finding.code),
      grade: {
        kind: 'axes',
        tier: finding.tier,
        impact: finding.impact,
        confidence: finding.confidence,
      },
      // `derivePriority` is the repo's existing sort-only surface (ADR 0019,
      // `derived.ts:48`) and `weight` is documented as ordering ONLY, so the two
      // agree by construction. The floor never reads this number — it reads
      // `grade`.
      weight: derivePriority(finding.tier, finding.impact, finding.confidence),
      conflictKeys: [file],
      ref: finding,
    };
  });
}

/**
 * Form the clumps a craft run emits alongside its findings.
 *
 * NO TOUCHED SET IS PASSED, and that is the spec's stated, deliberate outcome
 * rather than an oversight. A craft sweep walks the repository; it is not an
 * in-flight diff, so there is no set of files the caller already has open. By
 * `resolveFloor`'s rule an absent touched set degrades every sub-floor item to
 * `'file'`, so Goal 3's `'act'` resolution is STRUCTURALLY UNREACHABLE at this
 * seam — reachable only at the review seam, which has the diff. Recording that
 * is better than letting a goal read as met everywhere, and
 * `clumpable.test.ts` asserts it so it cannot drift to `'act'` silently the day
 * someone threads a plausible-looking file list through here.
 */
export function clumpCraftFindings(
  findings: readonly CraftClumpableFinding[],
  policy?: Partial<ClumpPolicy>
): ClumpResult {
  return formClumps(toClumpableItems(findings), policy);
}
