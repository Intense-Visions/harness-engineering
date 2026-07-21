import { describe, it, expect, beforeEach } from 'vitest';
import {
  filterAndSortInteractions,
  findAttentionThreadId,
} from '../../../../src/client/components/attention/helpers';
import { useThreadStore } from '../../../../src/client/stores/threadStore';
import type { PendingInteraction } from '../../../../src/client/types/orchestrator';
import type { Thread } from '../../../../src/client/types/thread';

/** Build a PendingInteraction with sensible, overridable defaults. */
function makeInteraction(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: 'int-1',
    issueId: 'ISSUE-1',
    type: 'needs-human',
    reasons: ['High complexity'],
    context: {
      issueTitle: 'Add retry logic',
      issueDescription: 'Wrap the fetch in exponential backoff',
      specPath: null,
      planPath: null,
      relatedFiles: [],
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

/** Build a Thread with sensible, overridable defaults (attention type by default). */
function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'attn:int-1',
    type: 'attention',
    title: 'Attention: ISSUE-1',
    status: 'pending',
    createdAt: 1,
    updatedAt: 1,
    avatar: 'alert',
    unread: false,
    meta: {
      interactionId: 'int-1',
      issueId: 'ISSUE-1',
      reasons: ['High complexity'],
      context: null,
    },
    ...overrides,
  };
}

describe('filterAndSortInteractions', () => {
  it('drops resolved interactions and keeps pending and claimed ones', () => {
    const interactions = [
      makeInteraction({ id: 'a', status: 'pending' }),
      makeInteraction({ id: 'b', status: 'claimed' }),
      makeInteraction({ id: 'c', status: 'resolved' }),
    ];

    const result = filterAndSortInteractions(interactions, '');

    expect(result.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('returns all non-resolved interactions when the query is empty', () => {
    const interactions = [
      makeInteraction({ id: 'a', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeInteraction({ id: 'b', createdAt: '2026-07-02T00:00:00.000Z' }),
    ];

    const result = filterAndSortInteractions(interactions, '');

    expect(result).toHaveLength(interactions.length);
  });

  it('sorts surviving interactions newest-first by createdAt', () => {
    const oldest = makeInteraction({ id: 'oldest', createdAt: '2026-07-01T00:00:00.000Z' });
    const middle = makeInteraction({ id: 'middle', createdAt: '2026-07-05T00:00:00.000Z' });
    const newest = makeInteraction({ id: 'newest', createdAt: '2026-07-09T00:00:00.000Z' });

    // Deliberately unsorted input to prove the sort, not the input order.
    const result = filterAndSortInteractions([oldest, newest, middle], '');

    expect(result.map((i) => i.id)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('matches the query against the issue title case-insensitively', () => {
    const interactions = [
      makeInteraction({
        id: 'match',
        context: { ...makeInteraction().context, issueTitle: 'Fix Flaky Test' },
      }),
      makeInteraction({
        id: 'miss',
        context: { ...makeInteraction().context, issueTitle: 'Unrelated work' },
      }),
    ];

    const result = filterAndSortInteractions(interactions, 'FLAKY');

    expect(result.map((i) => i.id)).toEqual(['match']);
  });

  it('matches the query against the issue description', () => {
    const interactions = [
      makeInteraction({
        id: 'match',
        context: { ...makeInteraction().context, issueDescription: 'Uses exponential backoff' },
      }),
      makeInteraction({
        id: 'miss',
        context: { ...makeInteraction().context, issueDescription: 'Nothing relevant here' },
      }),
    ];

    const result = filterAndSortInteractions(interactions, 'backoff');

    expect(result.map((i) => i.id)).toEqual(['match']);
  });

  it('matches the query against any of the reasons', () => {
    const interactions = [
      makeInteraction({ id: 'match', reasons: ['Low confidence', 'Ambiguous spec'] }),
      makeInteraction({ id: 'miss', reasons: ['Ready to ship'] }),
    ];

    const result = filterAndSortInteractions(interactions, 'ambiguous');

    expect(result.map((i) => i.id)).toEqual(['match']);
  });

  it('matches the query against the interaction id and the issue id', () => {
    const interactions = [
      makeInteraction({ id: 'INT-ABC', issueId: 'ISSUE-100' }),
      makeInteraction({ id: 'INT-XYZ', issueId: 'ISSUE-200' }),
    ];

    expect(filterAndSortInteractions(interactions, 'int-abc').map((i) => i.id)).toEqual([
      'INT-ABC',
    ]);
    expect(filterAndSortInteractions(interactions, 'issue-200').map((i) => i.id)).toEqual([
      'INT-XYZ',
    ]);
  });

  it('trims surrounding whitespace from the query before matching', () => {
    const interactions = [
      makeInteraction({
        id: 'match',
        context: { ...makeInteraction().context, issueTitle: 'Add retry logic' },
      }),
      makeInteraction({
        id: 'miss',
        context: { ...makeInteraction().context, issueTitle: 'Something else' },
      }),
    ];

    // A whitespace-only query is treated as empty (returns everything)...
    expect(filterAndSortInteractions(interactions, '   ')).toHaveLength(interactions.length);
    // ...while a padded real query still matches on the trimmed term.
    expect(filterAndSortInteractions(interactions, '  retry  ').map((i) => i.id)).toEqual([
      'match',
    ]);
  });

  it('excludes non-matching interactions entirely', () => {
    const interactions = [makeInteraction({ id: 'only' })];

    const result = filterAndSortInteractions(interactions, 'no-such-term-anywhere');

    expect(result).toEqual([]);
  });

  it('never returns a resolved interaction even when it matches the query', () => {
    const interactions = [
      makeInteraction({
        id: 'resolved-match',
        status: 'resolved',
        context: { ...makeInteraction().context, issueTitle: 'Add retry logic' },
      }),
    ];

    const result = filterAndSortInteractions(interactions, 'retry');

    expect(result).toEqual([]);
  });

  it('tolerates a null issue description without matching it', () => {
    const interactions = [
      makeInteraction({
        id: 'only',
        context: { ...makeInteraction().context, issueDescription: null },
      }),
    ];

    // Should not throw on the null description, and should not spuriously match.
    expect(filterAndSortInteractions(interactions, 'anything')).toEqual([]);
    expect(filterAndSortInteractions(interactions, '')).toHaveLength(1);
  });
});

describe('findAttentionThreadId', () => {
  beforeEach(() => {
    useThreadStore.setState({ threads: new Map() });
  });

  it('returns the thread id whose attention meta matches the interaction id', () => {
    const thread = makeThread({
      id: 'attn:target',
      meta: { interactionId: 'target', issueId: 'ISSUE-1', reasons: [], context: null },
    });
    useThreadStore.setState({ threads: new Map([[thread.id, thread]]) });

    expect(findAttentionThreadId('target')).toBe('attn:target');
  });

  it('returns undefined when no attention thread matches the interaction id', () => {
    const thread = makeThread({
      id: 'attn:other',
      meta: { interactionId: 'other', issueId: 'ISSUE-1', reasons: [], context: null },
    });
    useThreadStore.setState({ threads: new Map([[thread.id, thread]]) });

    expect(findAttentionThreadId('missing')).toBeUndefined();
  });

  it('ignores non-attention threads that happen to carry the interaction id', () => {
    const chatThread = makeThread({
      id: 'chat:decoy',
      type: 'chat',
      // A chat meta does not have an interactionId; guard must not match it.
      meta: { sessionId: 'sess-1', command: null },
    });
    useThreadStore.setState({ threads: new Map([[chatThread.id, chatThread]]) });

    expect(findAttentionThreadId('sess-1')).toBeUndefined();
  });

  it('returns undefined when the store has no threads at all', () => {
    expect(findAttentionThreadId('anything')).toBeUndefined();
  });
});
