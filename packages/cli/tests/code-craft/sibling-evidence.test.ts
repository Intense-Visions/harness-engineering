/**
 * The rendered duplication-evidence block, asserted on its wording.
 *
 * Two phrases here are load-bearing rather than decorative — `CALLS INTO` and
 * `confirm what it exports`. They are Phase 4's gate-fix correction (I1): a
 * `partial-extraction` label means the copies call into a shared module, NOT
 * that the exact wrapper already lives there. Before the predicate was
 * tightened, three classes named a module that exported no such helper at all,
 * so the operator-facing promise was false for 3 of 10 classes. This is the one
 * claim this feature got provably wrong once already, which is why it is pinned
 * by assertion and not left to the reviewer of a future reword.
 *
 * Source: docs/changes/duplication-detection/proposal.md (Phase 5).
 */

import { describe, it, expect } from 'vitest';
import type { CloneClass, CloneMember } from '@harness-engineering/core';
import { renderSiblingEvidence } from '../../src/code-craft/phases/sibling-evidence';

function member(file: string, startLine: number, unit = 'wrapper'): CloneMember {
  return { file, unit, kind: 'function', startLine, endLine: startLine + 9 };
}

function cloneClass(members: CloneMember[], over: Partial<CloneClass> = {}): CloneClass {
  const tokenCount = over.tokenCount ?? 90;
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    tokenCount,
    members,
    rank: tokenCount * members.length,
    priority: tokenCount * members.length,
    signal: 'duplicate',
    ...over,
  };
}

const TWO: CloneMember[] = [
  member('packages/cli/src/naming-craft/phases/critique.ts', 71, 'parseFencedJson'),
  member('packages/cli/src/docs-craft/phases/critique.ts', 88, 'parseFencedJson'),
];

describe('renderSiblingEvidence', () => {
  it('names the token count and both locations for a plain duplicate', () => {
    // The class carries a `sharedImport` while its signal stays `duplicate`.
    // That combination is what makes the case adverse: with `sharedImport`
    // absent, `sharedModuleLine` returns undefined on its SECOND guard and the
    // signal check is never the thing rejecting the label — the mutant that
    // deletes the signal check then survives, which it did on the first
    // writing of this fixture, 7 of 7 green.
    const lines = renderSiblingEvidence(
      TWO,
      cloneClass([...TWO, member('x.ts', 1)], {
        sharedImport: 'packages/cli/src/shared/craft/fenced-json',
      })
    );
    const text = lines.join('\n');

    expect(text).toContain('(90 tokens)');
    expect(text).toContain('2 other locations:');
    expect(text).toContain('- packages/cli/src/naming-craft/phases/critique.ts:71');
    expect(text).toContain('- packages/cli/src/docs-craft/phases/critique.ts:88');
    expect(text).toContain('(function parseFencedJson)');
    // Mutation: drop the `signal !== 'partial-extraction'` guard in
    // sharedModuleLine — the label appears on a plain duplicate.
    expect(text).not.toContain('PARTIAL EXTRACTION');
  });

  it("holds Phase 4's corrected promise for a partial-extraction class", () => {
    const cls = cloneClass([...TWO, member('x.ts', 1)], {
      signal: 'partial-extraction',
      sharedImport: 'packages/cli/src/shared/craft/fenced-json',
    });
    const text = renderSiblingEvidence(TWO, cls).join('\n');

    expect(text).toContain('PARTIAL EXTRACTION');
    expect(text).toContain('packages/cli/src/shared/craft/fenced-json');
    // Mutation: reword to "the helper already exists, import it" — both of
    // these fail. The label's promise is that the copies share a CALLED
    // module, which is not the same claim as the wrapper already living there.
    expect(text).toContain('CALLS INTO');
    expect(text).toContain('confirm what it exports');
    expect(text).toContain('NOT necessarily a delete-and-import');
    // The three assertions above pin the CORRECTION's presence, which is not
    // the same as the false promise's absence: a reword that keeps them and
    // adds "the helper already exists, just import it" beside them satisfies
    // all three. It did — that mutant survived the first writing of this case.
    // So the claim the block must never make is asserted directly.
    expect(text).not.toMatch(/already exists/i);
    expect(text).not.toMatch(/just import it/i);
  });

  it('renders no label when a labelled class carries no sharedImport', () => {
    // Reachable because `sharedImport` is optional on the published type and a
    // hand-built class can omit it. The class invariant ties it to the signal,
    // but this renderer is a consumer of the published shape, not its producer.
    const cls = cloneClass([...TWO, member('x.ts', 1)], { signal: 'partial-extraction' });
    const text = renderSiblingEvidence(TWO, cls).join('\n');

    // Mutation: drop the `sharedImport === undefined` guard — renders the
    // literal `undefined` inside backticks into an LLM prompt.
    expect(text).not.toContain('PARTIAL EXTRACTION');
    expect(text).not.toContain('undefined');
  });

  it('caps the rendered locations at ten and counts the rest', () => {
    // Reachable because the fixture holds 14 members, above the cap of 10.
    const many = Array.from({ length: 14 }, (_, i) => member(`packages/p/src/f${i}.ts`, 10 + i));
    const lines = renderSiblingEvidence(many, cloneClass([...many, member('x.ts', 1)]));

    // Mutation: `slice(0, MAX_RENDERED_SIBLINGS)` -> `slice()` — 14 location
    // lines and no `(+4` summary.
    expect(lines.filter((l) => l.startsWith('- packages/p/src/'))).toHaveLength(10);
    expect(lines).toContain('- (+4 more not listed)');
    expect(lines.join('\n')).toContain('14 other locations:');
  });

  it('uses the singular for exactly one sibling', () => {
    const one = [member('packages/p/src/only.ts', 5)];
    const text = renderSiblingEvidence(one, cloneClass([...one, member('x.ts', 1)])).join('\n');

    // Mutation: drop the count === 1 ternary in shapeLine.
    expect(text).toContain('1 other location:');
    expect(text).not.toContain('1 other locations');
  });

  it('degrades to locations only when no class is supplied', () => {
    // The spec's literal wording adds `siblings?: CloneMember[]` alone, so a
    // caller following it verbatim has no class to pass.
    const text = renderSiblingEvidence(TWO).join('\n');

    // Mutation: make siblingClass required and read cls.tokenCount unguarded —
    // throws.
    expect(text).toContain("This unit's token shape also appears at 2 other locations:");
    expect(text).not.toContain('tokens)');
    expect(text).not.toContain('PARTIAL EXTRACTION');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');
  });

  it('ends with a trailing blank line so the splice keeps the prompt spacing', () => {
    const lines = renderSiblingEvidence(TWO, cloneClass([...TWO, member('x.ts', 1)]));
    // Mutation: drop the trailing '' — the evidence block runs straight into
    // 'Respond with a fenced JSON block.' in the rendered prompt.
    expect(lines.at(-1)).toBe('');
    expect(lines.at(-2)).toContain("CODE-R004's Rule-of-Three clause");
  });
});
