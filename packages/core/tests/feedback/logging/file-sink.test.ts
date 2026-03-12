import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSink } from '../../../src/feedback/logging/file-sink';
import { existsSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { AgentAction } from '../../../src/feedback/types';

describe('FileSink', () => {
  const testDir = join(__dirname, '../../../tests/fixtures/feedback/temp');
  const testFile = join(testDir, 'actions.jsonl');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  afterEach(async () => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  const testAction: AgentAction = {
    id: 'test-id',
    type: 'self-review',
    timestamp: '2026-03-12T10:00:00.000Z',
    status: 'completed',
    context: { trigger: 'manual' },
  };

  it('should have name "file"', () => {
    const sink = new FileSink(testFile);
    expect(sink.name).toBe('file');
  });

  it('should write action to file as JSON line', async () => {
    const sink = new FileSink(testFile);
    const result = await sink.write(testAction);
    await sink.close?.();

    expect(result.ok).toBe(true);
    expect(existsSync(testFile)).toBe(true);

    const content = readFileSync(testFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.id).toBe('test-id');
  });

  it('should append multiple actions', async () => {
    const sink = new FileSink(testFile, { mode: 'append' });

    await sink.write(testAction);
    await sink.write({ ...testAction, id: 'test-id-2' });
    await sink.close?.();

    const content = readFileSync(testFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
  });

  it('should flush buffered writes', async () => {
    const sink = new FileSink(testFile, { bufferSize: 10 });

    await sink.write(testAction);
    await sink.flush?.();

    expect(existsSync(testFile)).toBe(true);
  });
});
