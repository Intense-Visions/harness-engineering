import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GraphStore } from '@harness-engineering/graph';
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js';
import type { ExecutionOutcome } from '../../src/outcome/types.js';
import {
  loadProfiles,
  saveProfiles,
  refreshProfiles,
} from '../../src/specialization/persistence.js';
import type { ProfileStore } from '../../src/specialization/persistence.js';
import type { SpecializationProfile } from '../../src/specialization/types.js';

let tmpDir: string;
let nextId = 0;

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  nextId += 1;
  return {
    id: `outcome:issue-${nextId}:1`,
    issueId: `issue-${nextId}`,
    identifier: `TEST-${nextId}`,
    result: 'success',
    retryCount: 0,
    failureReasons: [],
    durationMs: 1000,
    linkedSpecId: null,
    affectedSystemNodeIds: [],
    timestamp: '2026-04-17T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spec-'));
  fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  nextId = 0;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadProfiles', () => {
  it('returns empty store when file does not exist', () => {
    const store = loadProfiles(tmpDir);
    expect(store.version).toBe(1);
    expect(store.profiles).toEqual({});
    expect(store.computedAt).toBeTruthy();
  });

  it('reads back what saveProfiles wrote', () => {
    const profile: SpecializationProfile = {
      persona: 'task-executor',
      entries: [],
      strengths: [],
      weaknesses: [],
      overallLevel: 'novice',
      computedAt: '2026-04-17T00:00:00.000Z',
    };

    const original: ProfileStore = {
      profiles: { 'task-executor': profile },
      computedAt: '2026-04-17T00:00:00.000Z',
      version: 1,
    };

    saveProfiles(tmpDir, original);
    const loaded = loadProfiles(tmpDir);

    expect(loaded.version).toBe(1);
    expect(loaded.profiles['task-executor']).toEqual(profile);
  });
});

describe('saveProfiles', () => {
  it('writes valid JSON with version field', () => {
    const store: ProfileStore = {
      profiles: {},
      computedAt: '2026-04-17T00:00:00.000Z',
      version: 1,
    };

    saveProfiles(tmpDir, store);

    const filePath = path.join(tmpDir, '.harness', 'specialization-profiles.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(parsed.version).toBe(1);
  });
});

describe('refreshProfiles', () => {
  it('computes and persists profiles for all personas with outcomes', () => {
    const graphStore = new GraphStore();
    graphStore.addNode({ id: 'module:api', type: 'module', name: 'api', metadata: {} });

    const connector = new ExecutionOutcomeConnector(graphStore);
    for (let i = 0; i < 5; i++) {
      connector.ingest(
        makeOutcome({
          agentPersona: 'task-executor',
          taskType: 'bugfix',
          result: 'success',
          affectedSystemNodeIds: ['module:api'],
        })
      );
    }
    for (let i = 0; i < 3; i++) {
      connector.ingest(
        makeOutcome({
          agentPersona: 'code-reviewer',
          taskType: 'feature',
          result: 'failure',
          failureReasons: ['err'],
          affectedSystemNodeIds: ['module:api'],
        })
      );
    }

    const result = refreshProfiles(tmpDir, graphStore);

    expect(result.version).toBe(1);
    expect(Object.keys(result.profiles)).toContain('task-executor');
    expect(Object.keys(result.profiles)).toContain('code-reviewer');

    // Verify it was persisted
    const loaded = loadProfiles(tmpDir);
    expect(loaded.profiles['task-executor']).toBeDefined();
    expect(loaded.profiles['code-reviewer']).toBeDefined();
  });

  it('handles empty graph gracefully', () => {
    const graphStore = new GraphStore();
    const result = refreshProfiles(tmpDir, graphStore);

    expect(result.profiles).toEqual({});
    expect(result.version).toBe(1);
  });
});
