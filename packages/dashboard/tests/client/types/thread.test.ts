import { describe, it, expect } from 'vitest';
import type {
  Thread,
  ThreadType,
  ThreadAvatar,
  ThreadStatus,
  ChatMeta,
  AttentionMeta,
  AnalysisMeta,
  AgentMeta,
  SystemMeta,
} from '../../../src/client/types/thread';
import { SYSTEM_PAGES } from '../../../src/client/types/thread';

describe('Thread types', () => {
  it('Thread with ChatMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-1',
      type: 'chat',
      title: 'New Chat',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'user',
      unread: false,
      meta: { sessionId: 'sess-1', command: null } satisfies ChatMeta,
    };
    expect(thread.type).toBe('chat');
    expect(thread.status).toBe('active');
  });

  it('Thread with AttentionMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-2',
      type: 'attention',
      title: 'Security Issue',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'alert',
      unread: true,
      meta: {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['High complexity'],
        context: null,
      } satisfies AttentionMeta,
    };
    expect(thread.type).toBe('attention');
    expect(thread.avatar).toBe('alert');
  });

  it('Thread with AgentMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-3',
      type: 'agent',
      title: 'Agent Session',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'organism',
      unread: false,
      meta: {
        issueId: 'issue-2',
        identifier: 'feat/thing',
        phase: 'StreamingTurn',
      } satisfies AgentMeta,
    };
    expect(thread.type).toBe('agent');
  });

  it('Thread with AnalysisMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-4',
      type: 'analysis',
      title: 'Analyze Feature X',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'system',
      unread: false,
      meta: {
        analysisTitle: 'Feature X',
        description: 'Evaluate impact',
        labels: ['backend'],
      } satisfies AnalysisMeta,
    };
    expect(thread.type).toBe('analysis');
  });

  it('Thread with SystemMeta satisfies the interface', () => {
    const thread: Thread = {
      id: 'thread-5',
      type: 'system',
      title: 'Health',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      avatar: 'system',
      unread: false,
      meta: { page: 'health' } satisfies SystemMeta,
    };
    expect(thread.type).toBe('system');
  });

  it('ThreadType union covers all five types', () => {
    const types: ThreadType[] = ['chat', 'attention', 'analysis', 'agent', 'system'];
    expect(types).toHaveLength(5);
  });

  it('ThreadAvatar union covers all four variants', () => {
    const avatars: ThreadAvatar[] = ['user', 'organism', 'alert', 'system'];
    expect(avatars).toHaveLength(4);
  });

  it('ThreadStatus union covers all four variants', () => {
    const statuses: ThreadStatus[] = ['pending', 'active', 'completed', 'dismissed'];
    expect(statuses).toHaveLength(4);
  });

  it('SYSTEM_PAGES has entries for all dashboard pages', () => {
    expect(SYSTEM_PAGES.length).toBeGreaterThanOrEqual(10);
    const pages = SYSTEM_PAGES.map((p) => p.page);
    expect(pages).toContain('health');
    expect(pages).toContain('graph');
    expect(pages).toContain('roadmap');
  });
});
