import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { autoSyncRoadmap } from '../../../src/mcp/tools/roadmap-auto-sync';
import { loadTrackerSyncConfig as loadTrackerConfig } from '@harness-engineering/core';

// Minimal valid roadmap
const TEST_ROADMAP = `---
project: test-project
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Milestone: MVP

### Feature: Auth
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Auth system
`;

const TRACKER_CONFIG = {
  kind: 'github' as const,
  repo: 'owner/repo',
  labels: ['harness-managed'],
  statusMap: {
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    done: 'closed',
    blocked: 'open',
  },
  reverseStatusMap: {
    closed: 'done',
    'open:in-progress': 'in-progress',
  },
};

describe('loadTrackerConfig()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no config file exists', () => {
    expect(loadTrackerConfig(tmpDir)).toBeNull();
  });

  it('returns null when config has no roadmap section', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1 }),
      'utf-8'
    );
    expect(loadTrackerConfig(tmpDir)).toBeNull();
  });

  it('returns null when config has roadmap but no tracker', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: {} }),
      'utf-8'
    );
    expect(loadTrackerConfig(tmpDir)).toBeNull();
  });

  it('returns TrackerSyncConfig when tracker is present', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { tracker: TRACKER_CONFIG } }),
      'utf-8'
    );
    const result = loadTrackerConfig(tmpDir);
    expect(result).toEqual(TRACKER_CONFIG);
  });

  it('returns null on invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), 'not json', 'utf-8');
    expect(loadTrackerConfig(tmpDir)).toBeNull();
  });
});

describe('autoSyncRoadmap()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('does nothing when no roadmap.md exists', async () => {
    await autoSyncRoadmap(tmpDir); // should not throw
  });

  it('completes without error when roadmap exists but no tracker config', async () => {
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'roadmap.md'), TEST_ROADMAP, 'utf-8');
    await autoSyncRoadmap(tmpDir); // should not throw
  });

  it('does not attempt external sync when GITHUB_TOKEN is unset', async () => {
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'roadmap.md'), TEST_ROADMAP, 'utf-8');
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, roadmap: { tracker: TRACKER_CONFIG } }),
      'utf-8'
    );

    const origToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    try {
      await autoSyncRoadmap(tmpDir); // should not throw
    } finally {
      if (origToken) process.env.GITHUB_TOKEN = origToken;
    }
  });
});
