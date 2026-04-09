import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { appendFailure, loadFailures } from '../../src/state';

describe('appendFailure', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-failures-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should create failures.md with header if file does not exist', async () => {
    const result = await appendFailure(tmpDir, 'Attempted X, failed', 'harness-tdd', 'dead-end');
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'failures.md'), 'utf-8');
    expect(content).toContain('# Failures');
    expect(content).toContain('[skill:harness-tdd]');
    expect(content).toContain('[type:dead-end]');
    expect(content).toContain('Attempted X, failed');
  });

  it('should append to existing failures.md', async () => {
    await appendFailure(tmpDir, 'First failure', 'harness-tdd', 'dead-end');
    await appendFailure(tmpDir, 'Second failure', 'harness-execution', 'blocked');

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'failures.md'), 'utf-8');
    expect(content).toContain('First failure');
    expect(content).toContain('Second failure');
    expect(content).toContain('[skill:harness-execution]');
  });
});

describe('loadFailures', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-failures-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no failures file exists', async () => {
    const result = await loadFailures(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should parse failure entries from file', async () => {
    await appendFailure(tmpDir, 'Test failure', 'harness-tdd', 'dead-end');
    const result = await loadFailures(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0].skill).toBe('harness-tdd');
      expect(result.value[0].type).toBe('dead-end');
      expect(result.value[0].description).toBe('Test failure');
    }
  });

  it('should parse multiple failure entries', async () => {
    await appendFailure(tmpDir, 'Failure one', 'harness-tdd', 'dead-end');
    await appendFailure(tmpDir, 'Failure two', 'harness-execution', 'blocked');
    const result = await loadFailures(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });
});
