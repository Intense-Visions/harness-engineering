import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { StreamRecorder } from '../../src/core/stream-recorder';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stream-recorder-'));
}

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

describe('StreamRecorder', () => {
  let tmpDir: string;
  let recorder: StreamRecorder;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    recorder = new StreamRecorder(tmpDir, noopLogger);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('startRecording', () => {
    it('creates directory and manifest', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);

      const manifestPath = path.join(tmpDir, 'issue-1', 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.issueId).toBe('issue-1');
      expect(manifest.externalId).toBe(42);
      expect(manifest.identifier).toBe('feat/foo');
      expect(manifest.attempts).toHaveLength(1);
      expect(manifest.attempts[0].attempt).toBe(1);
    });

    it('writes session_start JSONL line', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);

      const streamPath = path.join(tmpDir, 'issue-1', '1.jsonl');
      expect(fs.existsSync(streamPath)).toBe(true);

      const lines = fs.readFileSync(streamPath, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(1);

      const firstEvent = JSON.parse(lines[0]);
      expect(firstEvent.type).toBe('session_start');
      expect(firstEvent.issueId).toBe('issue-1');
      expect(firstEvent.backend).toBe('claude');
      expect(firstEvent.attempt).toBe(1);
    });

    it('handles multiple attempts for same issue', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 2);

      const manifest = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'issue-1', 'manifest.json'), 'utf-8')
      );
      expect(manifest.attempts).toHaveLength(2);
      expect(manifest.attempts[1].attempt).toBe(2);

      expect(fs.existsSync(path.join(tmpDir, 'issue-1', '1.jsonl'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'issue-1', '2.jsonl'))).toBe(true);
    });
  });

  describe('recordEvent', () => {
    it('appends a JSONL line to the stream file', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);

      recorder.recordEvent('issue-1', 1, {
        type: 'text',
        timestamp: '2026-04-21T10:00:01Z',
        content: 'Hello world',
      });

      const lines = fs
        .readFileSync(path.join(tmpDir, 'issue-1', '1.jsonl'), 'utf-8')
        .trim()
        .split('\n');
      expect(lines).toHaveLength(2); // session_start + text

      const event = JSON.parse(lines[1]);
      expect(event.type).toBe('text');
      expect(event.content).toBe('Hello world');
    });

    it('produces valid JSON per line', () => {
      recorder.startRecording('issue-1', null, 'feat/bar', 'claude', 1);

      recorder.recordEvent('issue-1', 1, {
        type: 'thought',
        timestamp: '2026-04-21T10:00:01Z',
        content: 'Thinking...',
      });
      recorder.recordEvent('issue-1', 1, {
        type: 'call',
        timestamp: '2026-04-21T10:00:02Z',
        content: 'Calling Read(src/index.ts)',
      });

      const lines = fs
        .readFileSync(path.join(tmpDir, 'issue-1', '1.jsonl'), 'utf-8')
        .trim()
        .split('\n');

      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('accumulates tool names from call events', () => {
      recorder.startRecording('issue-1', null, 'feat/bar', 'claude', 1);

      recorder.recordEvent('issue-1', 1, {
        type: 'call',
        timestamp: '2026-04-21T10:00:02Z',
        content: 'Calling Read(src/index.ts)',
      });
      recorder.recordEvent('issue-1', 1, {
        type: 'call',
        timestamp: '2026-04-21T10:00:03Z',
        content: 'Calling Write(src/utils.ts)',
      });

      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 1000,
        outputTokens: 500,
        turnCount: 2,
      });

      const manifest = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'issue-1', 'manifest.json'), 'utf-8')
      );
      expect(manifest.attempts[0].stats.toolsCalled).toContain('Read');
      expect(manifest.attempts[0].stats.toolsCalled).toContain('Write');
    });
  });

  describe('finishRecording', () => {
    it('writes session_end line with stats', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.recordEvent('issue-1', 1, {
        type: 'text',
        timestamp: '2026-04-21T10:00:01Z',
        content: 'Done',
      });

      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 50000,
        outputTokens: 12000,
        turnCount: 8,
      });

      const lines = fs
        .readFileSync(path.join(tmpDir, 'issue-1', '1.jsonl'), 'utf-8')
        .trim()
        .split('\n');
      const lastEvent = JSON.parse(lines[lines.length - 1]);

      expect(lastEvent.type).toBe('session_end');
      expect(lastEvent.outcome).toBe('normal');
      expect(lastEvent.stats.inputTokens).toBe(50000);
      expect(lastEvent.stats.outputTokens).toBe(12000);
      expect(lastEvent.stats.turnCount).toBe(8);
    });

    it('updates manifest with attempt outcome and stats', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 50000,
        outputTokens: 12000,
        turnCount: 8,
      });

      const manifest = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'issue-1', 'manifest.json'), 'utf-8')
      );
      expect(manifest.attempts[0].outcome).toBe('normal');
      expect(manifest.attempts[0].endedAt).toBeDefined();
      expect(manifest.attempts[0].stats.inputTokens).toBe(50000);
    });

    it('sets orphan expiry when no PR is linked', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 1000,
        outputTokens: 500,
        turnCount: 1,
      });

      const manifest = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'issue-1', 'manifest.json'), 'utf-8')
      );
      expect(manifest.retention.strategy).toBe('orphan');
      expect(manifest.retention.orphanExpiresAt).toBeDefined();
    });
  });

  describe('getManifest', () => {
    it('returns parsed manifest', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);

      const manifest = recorder.getManifest('issue-1');
      expect(manifest).not.toBeNull();
      expect(manifest!.issueId).toBe('issue-1');
    });

    it('returns null for nonexistent issue', () => {
      expect(recorder.getManifest('nonexistent')).toBeNull();
    });
  });

  describe('getStream', () => {
    it('returns JSONL content for a specific attempt', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.recordEvent('issue-1', 1, {
        type: 'text',
        timestamp: '2026-04-21T10:00:01Z',
        content: 'Hello',
      });

      const content = recorder.getStream('issue-1', 1);
      expect(content).not.toBeNull();
      const lines = content!.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('returns latest attempt when no attempt specified', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 2);
      recorder.recordEvent('issue-1', 2, {
        type: 'text',
        timestamp: '2026-04-21T10:00:01Z',
        content: 'Second attempt',
      });

      const content = recorder.getStream('issue-1');
      expect(content).not.toBeNull();
      expect(content).toContain('Second attempt');
    });

    it('returns null for nonexistent stream', () => {
      expect(recorder.getStream('nonexistent')).toBeNull();
    });
  });

  describe('linkPR', () => {
    it('updates manifest with PR info', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.linkPR('issue-1', 87);

      const manifest = recorder.getManifest('issue-1');
      expect(manifest!.pr).toEqual(
        expect.objectContaining({
          number: 87,
          status: 'open',
        })
      );
      expect(manifest!.pr!.linkedAt).toBeDefined();
    });

    it('sets retention strategy to pr-linked', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 1000,
        outputTokens: 500,
        turnCount: 1,
      });
      recorder.linkPR('issue-1', 87);

      const manifest = recorder.getManifest('issue-1');
      expect(manifest!.retention.strategy).toBe('pr-linked');
      expect(manifest!.retention.orphanExpiresAt).toBeNull();
    });
  });

  describe('sweepExpired', () => {
    it('preserves PR-linked stream where PR is in open list', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 1000,
        outputTokens: 500,
        turnCount: 1,
      });
      recorder.linkPR('issue-1', 87);

      recorder.sweepExpired([87]);

      expect(fs.existsSync(path.join(tmpDir, 'issue-1'))).toBe(true);
    });

    it('deletes PR-linked stream where PR is not in open list', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 1000,
        outputTokens: 500,
        turnCount: 1,
      });
      recorder.linkPR('issue-1', 87);

      recorder.sweepExpired([]);

      expect(fs.existsSync(path.join(tmpDir, 'issue-1'))).toBe(false);
    });

    it('deletes orphan stream past its TTL', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 1000,
        outputTokens: 500,
        turnCount: 1,
      });

      // Manually set orphanExpiresAt to the past
      const manifestPath = path.join(tmpDir, 'issue-1', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.retention.orphanExpiresAt = '2020-01-01T00:00:00Z';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      recorder.sweepExpired([]);

      expect(fs.existsSync(path.join(tmpDir, 'issue-1'))).toBe(false);
    });

    it('preserves orphan stream not yet past TTL', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 1000,
        outputTokens: 500,
        turnCount: 1,
      });

      // orphanExpiresAt should be 7 days from now (future)
      recorder.sweepExpired([]);

      expect(fs.existsSync(path.join(tmpDir, 'issue-1'))).toBe(true);
    });
  });

  describe('updateHighlights', () => {
    it('stores highlights in manifest', () => {
      recorder.startRecording('issue-1', 42, 'feat/foo', 'claude', 1);
      recorder.finishRecording('issue-1', 1, 'normal', {
        inputTokens: 1000,
        outputTokens: 500,
        turnCount: 1,
      });

      recorder.updateHighlights('issue-1', [
        {
          timestamp: '2026-04-21T10:05:00Z',
          summary: 'Created src/utils.ts',
          category: 'file_op',
        },
      ]);

      const manifest = recorder.getManifest('issue-1');
      expect(manifest!.highlights).toBeDefined();
      expect(manifest!.highlights!.moments).toHaveLength(1);
      expect(manifest!.highlights!.postedToPr).toBe(false);
    });
  });
});
