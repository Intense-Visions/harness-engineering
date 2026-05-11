import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore } from '../../../src/client/stores/toastStore';

beforeEach(() => {
  useToastStore.getState().clear();
});

describe('toastStore', () => {
  it('starts with no current toast', () => {
    expect(useToastStore.getState().current).toBeNull();
  });

  it('pushConflict sets the current toast with externalId and conflictedWith', () => {
    useToastStore.getState().pushConflict({
      externalId: 'github:owner/repo#42',
      conflictedWith: '@alice',
    });
    const cur = useToastStore.getState().current;
    expect(cur).not.toBeNull();
    expect(cur?.kind).toBe('conflict');
    expect(cur?.externalId).toBe('github:owner/repo#42');
    expect(cur?.conflictedWith).toBe('@alice');
  });

  it('a new pushConflict supersedes the previous one (single-toast model)', () => {
    useToastStore.getState().pushConflict({ externalId: 'a', conflictedWith: '@a' });
    useToastStore.getState().pushConflict({ externalId: 'b', conflictedWith: '@b' });
    expect(useToastStore.getState().current?.externalId).toBe('b');
  });

  it('clear() removes the current toast', () => {
    useToastStore.getState().pushConflict({ externalId: 'x', conflictedWith: null });
    useToastStore.getState().clear();
    expect(useToastStore.getState().current).toBeNull();
  });

  it('null conflictedWith is preserved (component renders fallback wording)', () => {
    useToastStore.getState().pushConflict({ externalId: 'x', conflictedWith: null });
    expect(useToastStore.getState().current?.conflictedWith).toBeNull();
  });
});
