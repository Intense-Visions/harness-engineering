/**
 * Renders the mechanical duplication evidence block appended to a
 * sibling-aware critique prompt.
 *
 * Kept out of `critique.ts` so the wording is unit-testable without building a
 * whole prompt, and out of `extract/siblings.ts` so a discovery module does not
 * own LLM-facing copy.
 *
 * Source: docs/changes/duplication-detection/proposal.md (Phase 5).
 */

import type { CloneClass, CloneMember } from '@harness-engineering/core';

/** Locations rendered before the list is summarised with a `(+N more)` line. */
const MAX_RENDERED_SIBLINGS = 10;

/**
 * Prompt lines for one unit's clone siblings, including the trailing blank.
 *
 * `siblingClass` is optional on purpose: the spec's literal wording adds
 * `siblings?: CloneMember[]` alone, so a caller following it verbatim passes the
 * locations with no class. That degenerate path renders the locations and omits
 * the token count and the signal, rather than failing or inventing a number.
 */
export function renderSiblingEvidence(
  siblings: readonly CloneMember[],
  siblingClass?: CloneClass
): string[] {
  const shown = siblings.slice(0, MAX_RENDERED_SIBLINGS);
  const lines = [
    'MECHANICAL DUPLICATION EVIDENCE (not a judgment — a whole-unit token-shape match, with identifier and literal spellings normalized away):',
    shapeLine(siblings.length, siblingClass),
    ...shown.map((m) => `- ${m.file}:${m.startLine} (${m.kind} ${m.unit})`),
  ];
  if (siblings.length > shown.length) {
    lines.push(`- (+${siblings.length - shown.length} more not listed)`);
  }
  const shared = sharedModuleLine(siblingClass);
  if (shared !== undefined) lines.push(shared);
  lines.push(
    "This is the evidence CODE-R004's Rule-of-Three clause asks for. Judge whether these copies are crying out for one named home, and if so name the home concretely. Copies that share a shape but would each need a distinct parameter per call site are NOT a missing abstraction.",
    ''
  );
  return lines;
}

function shapeLine(count: number, cls?: CloneClass): string {
  const where = `${count} other location${count === 1 ? '' : 's'}`;
  return cls === undefined
    ? `This unit's token shape also appears at ${where}:`
    : `This unit's normalized token shape (${cls.tokenCount} tokens) also appears at ${where}:`;
}

/**
 * The `partial-extraction` line, or `undefined` for a plain duplicate.
 *
 * The wording is the Phase-4 gate fix (I1) held to: a labelled class means the
 * members CALL INTO the named module, NOT that the exact wrapper already lives
 * there. Three classes carried a `sharedImport` naming a module that exported no
 * such helper at all before the predicate was tightened, and the operator-facing
 * promise was false for 3 of 10 classes. Telling a model "the helper exists,
 * just import it" where it does not is the same false promise with a larger
 * blast radius.
 */
function sharedModuleLine(cls?: CloneClass): string | undefined {
  if (cls === undefined || cls.signal !== 'partial-extraction') return undefined;
  if (cls.sharedImport === undefined) return undefined;
  return (
    `PARTIAL EXTRACTION: every copy CALLS INTO one first-party module — \`${cls.sharedImport}\` ` +
    '(a repo-relative extensionless module key, not a file path). The shared layer is already ' +
    'extracted and only the wrapper layer stayed duplicated, so the repair is cheaper than ' +
    'greenfield. It is NOT necessarily a delete-and-import: open that module and confirm what it ' +
    'exports before advising one — the tag means the copies share a CALLED module, not that this ' +
    'exact wrapper already lives there.'
  );
}
