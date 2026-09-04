/**
 * Tracker-kind registry + loader/factory opening
 * (docs/changes/waypoint-tracker-kind-pnyon/proposal.md SC1/SC2).
 *
 * The pre-existing loader and factory suites are untouched (github behavior
 * byte-for-byte); this file covers only the NEW seam.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Ok } from '@harness-engineering/types';
import {
  registerTrackerKind,
  getTrackerKindRegistration,
  listRegisteredTrackerKinds,
} from '../../../src/roadmap/tracker/registry';
import { createTrackerClient } from '../../../src/roadmap/tracker/factory';
import { PnyonTrackerAdapter } from '../../../src/roadmap/tracker/adapters/pnyon';
import { loadTrackerClientConfigFromProject } from '../../../src/roadmap/load-tracker-client-config';

function tmpProject(config: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnyon-trackercfg-'));
  fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(config));
  return dir;
}

describe('tracker-kind registry', () => {
  it('has the builtin pnyon registration', () => {
    expect(listRegisteredTrackerKinds()).toContain('pnyon');
    expect(getTrackerKindRegistration('pnyon')?.kind).toBe('pnyon');
  });

  it('returns undefined for unregistered kinds', () => {
    expect(getTrackerKindRegistration('jira')).toBeUndefined();
  });

  it('third-party kinds register and resolve through the factory with no factory change', () => {
    const marker = {
      marker: true,
    } as unknown as import('../../../src/roadmap/tracker/client').RoadmapTrackerClient;
    registerTrackerKind({
      kind: 'test-double',
      loadProjectConfig: () => Ok({ kind: 'test-double' }),
      create: () => Ok(marker),
    });
    const r = createTrackerClient({ kind: 'test-double' } as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(marker);
  });
});

describe('loadTrackerClientConfigFromProject — pnyon kind (SC1)', () => {
  it('returns Ok({ kind: "pnyon", url, token }) for a valid config', () => {
    const dir = tmpProject({
      roadmap: {
        mode: 'file-less',
        tracker: { kind: 'pnyon', url: 'https://waypoint.test/o/outpost-1', token: 'tok' },
      },
    });
    const r = loadTrackerClientConfigFromProject(dir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        kind: 'pnyon',
        url: 'https://waypoint.test/o/outpost-1',
        token: 'tok',
      });
    }
  });

  it('omits token when unset (env fallback happens at create time)', () => {
    const dir = tmpProject({
      roadmap: { tracker: { kind: 'pnyon', url: 'https://waypoint.test/o/outpost-1' } },
    });
    const r = loadTrackerClientConfigFromProject(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ kind: 'pnyon', url: 'https://waypoint.test/o/outpost-1' });
  });

  it('fails at LOAD time naming the missing url field', () => {
    const dir = tmpProject({ roadmap: { tracker: { kind: 'pnyon' } } });
    const r = loadTrackerClientConfigFromProject(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/roadmap\.tracker\.url is required/);
  });

  it('rejects unregistered kinds, listing the registered kinds', () => {
    const dir = tmpProject({ roadmap: { tracker: { kind: 'jira', repo: 'x/y' } } });
    const r = loadTrackerClientConfigFromProject(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Same phrasing family the pre-existing suite pins (/only supports kind/i)
      expect(r.error.message).toMatch(/only supports kind/i);
      expect(r.error.message).toMatch(/github/);
      expect(r.error.message).toMatch(/pnyon/);
      expect(r.error.message).toMatch(/"jira"/);
    }
  });

  it('github behavior is untouched (regression)', () => {
    const dir = tmpProject({ roadmap: { tracker: { kind: 'github', repo: 'owner/repo' } } });
    const r = loadTrackerClientConfigFromProject(dir);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ kind: 'github-issues', repo: 'owner/repo' });
  });
});

describe('createTrackerClient — pnyon kind (SC2)', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it('returns Ok(PnyonTrackerAdapter) with an explicit token', () => {
    const r = createTrackerClient({
      kind: 'pnyon',
      url: 'https://waypoint.test/o/outpost-1',
      token: 'tok',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeInstanceOf(PnyonTrackerAdapter);
  });

  it('falls back to the PNYON_TOKEN env var', () => {
    vi.stubEnv('PNYON_TOKEN', 'env-tok');
    const r = createTrackerClient({ kind: 'pnyon', url: 'https://waypoint.test/o/outpost-1' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeInstanceOf(PnyonTrackerAdapter);
  });

  it('returns an actionable Err when no token is available', () => {
    vi.stubEnv('PNYON_TOKEN', '');
    const r = createTrackerClient({ kind: 'pnyon', url: 'https://waypoint.test/o/outpost-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/missing Pnyon token.*PNYON_TOKEN/i);
  });

  it('still rejects unregistered kinds with the original message', () => {
    const r = createTrackerClient({ kind: 'gitlab-issues' } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/Unsupported tracker kind/i);
  });
});
