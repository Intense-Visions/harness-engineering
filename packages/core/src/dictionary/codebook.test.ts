import { describe, expect, it } from 'vitest';

import {
  auditStaleReferences,
  definitionHash,
  deriveHandle,
  emptyCodebook,
  expand,
  reconcileCodebook,
  verifyEntry,
  HANDLE_PREFIX,
  type Codebook,
  type TermBinding,
} from './codebook';

const bind = (label: string, definition: string): TermBinding => ({ label, definition });

describe('deriveHandle', () => {
  it('is deterministic and namespaced', () => {
    const h = deriveHandle('layers');
    expect(h).toBe(deriveHandle('layers'));
    expect(h.startsWith(HANDLE_PREFIX)).toBe(true);
  });
  it('is independent of the definition (keys off the label only)', () => {
    // Same label -> same handle regardless of what its definition later becomes.
    expect(deriveHandle('schema')).toBe(deriveHandle('schema'));
  });
});

describe('reconcileCodebook', () => {
  it('mints new terms at version 1', () => {
    const book = reconcileCodebook(emptyCodebook(), [bind('layers', 'the rules')]);
    expect(book.entries).toHaveLength(1);
    expect(book.entries[0]?.version).toBe(1);
    expect(book.entries[0]?.verified).toBe(true);
    expect(verifyEntry(book.entries[0]!)).toBe(true);
    expect(book.history).toHaveLength(0);
  });

  it('keeps the version when the definition is unchanged', () => {
    const v1 = reconcileCodebook(emptyCodebook(), [bind('layers', 'the rules')]);
    const v2 = reconcileCodebook(v1, [bind('layers', 'the rules')]);
    expect(v2.entries[0]?.version).toBe(1);
    expect(v2.history).toHaveLength(0);
  });

  it('bumps the version and retains the prior definition when it changes', () => {
    const v1 = reconcileCodebook(emptyCodebook(), [bind('layers', 'old rules')]);
    const v2 = reconcileCodebook(v1, [bind('layers', 'new rules')]);
    expect(v2.entries[0]?.version).toBe(2);
    expect(v2.entries[0]?.definition).toBe('new rules');
    // prior version retained in history
    const priorHandle = deriveHandle('layers');
    expect(v2.history).toContainEqual(
      expect.objectContaining({ handle: priorHandle, version: 1, definition: 'old rules' })
    );
  });

  it('retires a term absent from the live bindings, moving it to history', () => {
    const v1 = reconcileCodebook(emptyCodebook(), [bind('a', 'aaa'), bind('b', 'bbb')]);
    const v2 = reconcileCodebook(v1, [bind('a', 'aaa')]);
    expect(v2.entries.map((e) => e.label)).toEqual(['a']);
    expect(v2.history.some((h) => h.label === 'b' && h.definition === 'bbb')).toBe(true);
  });

  it('is byte-stable (sorted) for a given input', () => {
    const a = reconcileCodebook(emptyCodebook(), [bind('z', 'z'), bind('a', 'a')]);
    const b = reconcileCodebook(emptyCodebook(), [bind('a', 'a'), bind('z', 'z')]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('expand — deterministic, version-pinned', () => {
  it('expands the current definition with no version', () => {
    const book = reconcileCodebook(emptyCodebook(), [bind('layers', 'the rules')]);
    expect(expand(book, deriveHandle('layers'))).toBe('the rules');
  });

  it('a changed definition never silently changes an old pinned meaning (AC2)', () => {
    const v1 = reconcileCodebook(emptyCodebook(), [bind('layers', 'old rules')]);
    const v2 = reconcileCodebook(v1, [bind('layers', 'new rules')]);
    const handle = deriveHandle('layers');
    // The consumer pinned v1: it still expands to the OLD text after the bump.
    expect(expand(v2, handle, 1)).toBe('old rules');
    // The live (unpinned) expansion is the new text.
    expect(expand(v2, handle, 2)).toBe('new rules');
    expect(expand(v2, handle)).toBe('new rules');
  });

  it('returns undefined for an unknown handle or unknown version — never a guess', () => {
    const book = reconcileCodebook(emptyCodebook(), [bind('layers', 'the rules')]);
    expect(expand(book, '@kb:deadbeef0000')).toBeUndefined();
    expect(expand(book, deriveHandle('layers'), 99)).toBeUndefined();
  });
});

describe('definitionHash', () => {
  it('is stable and change-sensitive', () => {
    expect(definitionHash('x')).toBe(definitionHash('x'));
    expect(definitionHash('x')).not.toBe(definitionHash('y'));
  });
});

describe('auditStaleReferences', () => {
  function twoVersionBook(): Codebook {
    const v1 = reconcileCodebook(emptyCodebook(), [bind('layers', 'old')]);
    return reconcileCodebook(v1, [bind('layers', 'new')]);
  }

  it('flags a pin to a superseded (but still expandable) version', () => {
    const book = twoVersionBook();
    const stale = auditStaleReferences(book, [{ handle: deriveHandle('layers'), version: 1 }]);
    expect(stale).toEqual([{ handle: deriveHandle('layers'), version: 1, reason: 'superseded' }]);
  });

  it('does not flag a pin to the current version', () => {
    const book = twoVersionBook();
    expect(auditStaleReferences(book, [{ handle: deriveHandle('layers'), version: 2 }])).toEqual(
      []
    );
  });

  it('flags unknown handles and unknown versions distinctly', () => {
    const book = twoVersionBook();
    const stale = auditStaleReferences(book, [
      { handle: '@kb:000000000000', version: 1 },
      { handle: deriveHandle('layers'), version: 7 },
    ]);
    expect(stale).toContainEqual({
      handle: '@kb:000000000000',
      version: 1,
      reason: 'unknown-handle',
    });
    expect(stale).toContainEqual(
      expect.objectContaining({
        handle: deriveHandle('layers'),
        version: 7,
        reason: 'unknown-version',
      })
    );
  });
});
