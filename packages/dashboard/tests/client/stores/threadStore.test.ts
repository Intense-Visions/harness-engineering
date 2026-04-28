import { describe, it, expect, beforeEach } from 'vitest';
import { useThreadStore, selectSidebarSections } from '../../../src/client/stores/threadStore';

describe('threadStore', () => {
  beforeEach(() => {
    useThreadStore.setState({
      threads: new Map(),
      activeThreadId: null,
      lastThreadId: null,
    });
  });

  describe('createThread', () => {
    it('creates a chat thread and adds it to the store', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      expect(thread.type).toBe('chat');
      expect(thread.status).toBe('active');
      expect(thread.avatar).toBe('user');
      expect(thread.title).toBe('New Chat');
      expect(useThreadStore.getState().threads.get(thread.id)).toBe(thread);
    });

    it('creates an attention thread with pending status', () => {
      const thread = useThreadStore.getState().createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['High complexity'],
        context: null,
      });
      expect(thread.type).toBe('attention');
      expect(thread.status).toBe('pending');
      expect(thread.avatar).toBe('alert');
      expect(thread.unread).toBe(true);
    });

    it('creates an agent thread with organism avatar', () => {
      const thread = useThreadStore.getState().createThread('agent', {
        issueId: 'issue-2',
        identifier: 'feat/thing',
        phase: 'StreamingTurn',
      });
      expect(thread.type).toBe('agent');
      expect(thread.avatar).toBe('organism');
    });

    it('creates an analysis thread', () => {
      const thread = useThreadStore.getState().createThread('analysis', {
        analysisTitle: 'Feature X',
        description: 'Evaluate impact',
        labels: ['backend'],
      });
      expect(thread.type).toBe('analysis');
      expect(thread.avatar).toBe('system');
      expect(thread.title).toBe('Feature X');
    });
  });

  describe('setActiveThread', () => {
    it('sets activeThreadId and updates lastThreadId', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      useThreadStore.getState().setActiveThread(thread.id);
      const state = useThreadStore.getState();
      expect(state.activeThreadId).toBe(thread.id);
      expect(state.lastThreadId).toBe(thread.id);
    });

    it('sets activeThreadId to null', () => {
      useThreadStore.getState().setActiveThread(null);
      expect(useThreadStore.getState().activeThreadId).toBeNull();
    });
  });

  describe('closeThread', () => {
    it('removes a thread from the store', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      useThreadStore.getState().closeThread(thread.id);
      expect(useThreadStore.getState().threads.has(thread.id)).toBe(false);
    });

    it('clears activeThreadId if closing the active thread', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      useThreadStore.getState().setActiveThread(thread.id);
      useThreadStore.getState().closeThread(thread.id);
      expect(useThreadStore.getState().activeThreadId).toBeNull();
    });
  });

  describe('claimThread', () => {
    it('transitions attention thread from pending to active', () => {
      const thread = useThreadStore.getState().createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['Risk'],
        context: null,
      });
      expect(thread.status).toBe('pending');
      useThreadStore.getState().claimThread(thread.id);
      const updated = useThreadStore.getState().threads.get(thread.id);
      expect(updated?.status).toBe('active');
      expect(updated?.unread).toBe(false);
    });
  });

  describe('dismissThread', () => {
    it('transitions a thread to dismissed status', () => {
      const thread = useThreadStore.getState().createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['Risk'],
        context: null,
      });
      useThreadStore.getState().dismissThread(thread.id);
      const updated = useThreadStore.getState().threads.get(thread.id);
      expect(updated?.status).toBe('dismissed');
    });
  });

  describe('sidebarSections (derived)', () => {
    it('sorts threads into correct sections', () => {
      const store = useThreadStore.getState();
      store.createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['Risk'],
        context: null,
      });
      store.createThread('chat', { sessionId: 'sess-1', command: null });
      store.createThread('agent', {
        issueId: 'issue-2',
        identifier: 'feat/x',
        phase: 'Thinking',
      });

      const sections = selectSidebarSections(useThreadStore.getState());
      expect(sections.attention).toHaveLength(1);
      expect(sections.attention[0].type).toBe('attention');
      expect(sections.active).toHaveLength(2);
      expect(sections.recent).toHaveLength(0);
    });

    it('moves completed threads to recent', () => {
      const thread = useThreadStore.getState().createThread('chat', {
        sessionId: 'sess-1',
        command: null,
      });
      useThreadStore.setState((state) => {
        const updated = { ...thread, status: 'completed' as const };
        const threads = new Map(state.threads);
        threads.set(thread.id, updated);
        return { threads };
      });

      const sections = selectSidebarSections(useThreadStore.getState());
      expect(sections.recent).toHaveLength(1);
      expect(sections.active).toHaveLength(0);
    });

    it('moves dismissed threads to recent', () => {
      const thread = useThreadStore.getState().createThread('attention', {
        interactionId: 'int-1',
        issueId: 'issue-1',
        reasons: ['Risk'],
        context: null,
      });
      useThreadStore.getState().dismissThread(thread.id);

      const sections = selectSidebarSections(useThreadStore.getState());
      expect(sections.attention).toHaveLength(0);
      expect(sections.recent).toHaveLength(1);
    });
  });
});
