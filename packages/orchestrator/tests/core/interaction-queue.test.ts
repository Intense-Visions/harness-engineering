import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { InteractionQueue } from '../../src/core/interaction-queue';
import type { PendingInteraction } from '../../src/core/interaction-queue';

describe('InteractionQueue', () => {
  let tmpDir: string;
  let queue: InteractionQueue;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iq-test-'));
    queue = new InteractionQueue(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('push', () => {
    it('creates the interactions directory if it does not exist', async () => {
      const interaction: PendingInteraction = {
        id: 'int-1',
        issueId: 'issue-1',
        type: 'needs-human',
        reasons: ['full-exploration tier always requires human'],
        context: {
          issueTitle: 'Implement new feature',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      };

      await queue.push(interaction);

      const filePath = path.join(tmpDir, 'int-1.json');
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.id).toBe('int-1');
      expect(parsed.status).toBe('pending');
    });
  });

  describe('list', () => {
    it('returns empty array when no interactions exist', async () => {
      const result = await queue.list();
      expect(result).toEqual([]);
    });

    it('returns all pending interactions', async () => {
      await queue.push({
        id: 'int-1',
        issueId: 'issue-1',
        type: 'needs-human',
        reasons: ['reason-1'],
        context: {
          issueTitle: 'A',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      });
      await queue.push({
        id: 'int-2',
        issueId: 'issue-2',
        type: 'needs-human',
        reasons: ['reason-2'],
        context: {
          issueTitle: 'B',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:01:00Z',
        status: 'pending',
      });

      const result = await queue.list();
      expect(result).toHaveLength(2);
    });
  });

  describe('updateStatus', () => {
    it('updates the status of an interaction', async () => {
      await queue.push({
        id: 'int-1',
        issueId: 'issue-1',
        type: 'needs-human',
        reasons: ['reason-1'],
        context: {
          issueTitle: 'A',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      });

      await queue.updateStatus('int-1', 'resolved');

      const items = await queue.list();
      expect(items[0].status).toBe('resolved');
    });

    it('throws when interaction does not exist', async () => {
      await expect(queue.updateStatus('nonexistent', 'resolved')).rejects.toThrow();
    });
  });

  describe('onPush listener', () => {
    it('calls registered listeners when an interaction is pushed', async () => {
      const listener = vi.fn();
      queue.onPush(listener);

      const interaction: PendingInteraction = {
        id: 'int-callback-1',
        issueId: 'issue-cb',
        type: 'needs-human',
        reasons: ['test callback'],
        context: {
          issueTitle: 'Callback Test',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      };

      await queue.push(interaction);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(interaction);
    });
  });

  describe('listPending', () => {
    it('returns only pending interactions', async () => {
      await queue.push({
        id: 'int-1',
        issueId: 'issue-1',
        type: 'needs-human',
        reasons: ['reason-1'],
        context: {
          issueTitle: 'A',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      });
      await queue.push({
        id: 'int-2',
        issueId: 'issue-2',
        type: 'needs-human',
        reasons: ['reason-2'],
        context: {
          issueTitle: 'B',
          issueDescription: null,
          specPath: null,
          planPath: null,
          relatedFiles: [],
        },
        createdAt: '2026-01-01T00:01:00Z',
        status: 'resolved',
      });

      const result = await queue.listPending();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('int-1');
    });
  });
});
