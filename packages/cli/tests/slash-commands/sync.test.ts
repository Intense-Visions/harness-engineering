import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { computeSyncPlan, applySyncPlan } from '../../src/slash-commands/sync';
import { GENERATED_HEADER_CLAUDE } from '../../src/slash-commands/types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'));
}

describe('computeSyncPlan', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects new files when output dir is empty', () => {
    const rendered = new Map([['execution.md', 'content']]);
    const plan = computeSyncPlan(tmpDir, rendered);
    expect(plan.added).toEqual(['execution.md']);
    expect(plan.updated).toEqual([]);
    expect(plan.removed).toEqual([]);
  });

  it('detects unchanged files', () => {
    fs.writeFileSync(path.join(tmpDir, 'execution.md'), 'content');
    const rendered = new Map([['execution.md', 'content']]);
    const plan = computeSyncPlan(tmpDir, rendered);
    expect(plan.unchanged).toEqual(['execution.md']);
    expect(plan.added).toEqual([]);
    expect(plan.updated).toEqual([]);
  });

  it('detects updated files', () => {
    fs.writeFileSync(path.join(tmpDir, 'execution.md'), 'old content');
    const rendered = new Map([['execution.md', 'new content']]);
    const plan = computeSyncPlan(tmpDir, rendered);
    expect(plan.updated).toEqual(['execution.md']);
  });

  it('detects removed files (orphans with generated header)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'old-skill.md'),
      `${GENERATED_HEADER_CLAUDE}\n---\nname: harness:old\n---`
    );
    const rendered = new Map<string, string>();
    const plan = computeSyncPlan(tmpDir, rendered);
    expect(plan.removed).toEqual(['old-skill.md']);
  });

  it('does not flag non-generated files as removed', () => {
    fs.writeFileSync(path.join(tmpDir, 'custom.md'), 'hand-authored content');
    const rendered = new Map<string, string>();
    const plan = computeSyncPlan(tmpDir, rendered);
    expect(plan.removed).toEqual([]);
  });
});

describe('applySyncPlan', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes new files', () => {
    const rendered = new Map([['execution.md', 'new content']]);
    applySyncPlan(
      tmpDir,
      rendered,
      { added: ['execution.md'], updated: [], removed: [], unchanged: [] },
      false
    );
    expect(fs.readFileSync(path.join(tmpDir, 'execution.md'), 'utf-8')).toBe('new content');
  });

  it('overwrites updated files', () => {
    fs.writeFileSync(path.join(tmpDir, 'execution.md'), 'old');
    const rendered = new Map([['execution.md', 'new']]);
    applySyncPlan(
      tmpDir,
      rendered,
      { added: [], updated: ['execution.md'], removed: [], unchanged: [] },
      false
    );
    expect(fs.readFileSync(path.join(tmpDir, 'execution.md'), 'utf-8')).toBe('new');
  });

  it('deletes removed files when deleteOrphans is true', () => {
    fs.writeFileSync(path.join(tmpDir, 'old.md'), 'x');
    applySyncPlan(
      tmpDir,
      new Map(),
      { added: [], updated: [], removed: ['old.md'], unchanged: [] },
      true
    );
    expect(fs.existsSync(path.join(tmpDir, 'old.md'))).toBe(false);
  });

  it('does not delete removed files when deleteOrphans is false', () => {
    fs.writeFileSync(path.join(tmpDir, 'old.md'), 'x');
    applySyncPlan(
      tmpDir,
      new Map(),
      { added: [], updated: [], removed: ['old.md'], unchanged: [] },
      false
    );
    expect(fs.existsSync(path.join(tmpDir, 'old.md'))).toBe(true);
  });
});
