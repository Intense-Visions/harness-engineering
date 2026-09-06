/**
 * Tests for the tracker-config diagnosis (issue #1863).
 *
 * `loadTrackerSyncConfig` returns a bare `null` for four different situations,
 * and the CLI rendered all of them as "harness.config.json has no
 * `roadmap.tracker` block". For a config that HAS a well-formed block naming a
 * kind sync cannot drive, that message is false and sends the reader hunting
 * for something that is sitting in front of them. These pin the distinction.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  diagnoseTrackerSyncConfig,
  explainTrackerSyncConfig,
  loadTrackerSyncConfig,
  SYNC_SUPPORTED_TRACKER_KINDS,
} from '../../src/roadmap/tracker-config';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-tracker-diag-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeConfig(tracker: unknown): void {
  const body = tracker === undefined ? { roadmap: {} } : { roadmap: { tracker } };
  fs.writeFileSync(path.join(root, 'harness.config.json'), JSON.stringify(body), 'utf-8');
}

const GITHUB_TRACKER = {
  kind: 'github',
  repo: 'owner/repo',
  labels: ['roadmap'],
  statusMap: {
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    done: 'closed',
    blocked: 'open',
  },
};

describe('diagnoseTrackerSyncConfig', () => {
  it('reports a usable github config as having no problem', () => {
    writeConfig(GITHUB_TRACKER);
    expect(diagnoseTrackerSyncConfig(root)).toEqual({ problem: 'none' });
    expect(loadTrackerSyncConfig(root)).not.toBeNull();
  });

  it('distinguishes a missing config file from a missing tracker block', () => {
    expect(diagnoseTrackerSyncConfig(root)).toEqual({ problem: 'no-config-file' });
    writeConfig(undefined);
    expect(diagnoseTrackerSyncConfig(root)).toEqual({ problem: 'no-tracker-block' });
  });

  /**
   * The bug in #1863. A well-formed block naming an unsupported kind is NOT a
   * missing block, and must not be reported as one.
   */
  it('names an unsupported kind rather than claiming the block is absent', () => {
    writeConfig({ ...GITHUB_TRACKER, kind: 'pnyon', url: 'https://waypoint.example' });

    const diagnosis = diagnoseTrackerSyncConfig(root);
    expect(diagnosis).toEqual({ problem: 'unsupported-kind', kind: 'pnyon' });

    const message = explainTrackerSyncConfig(diagnosis);
    expect(message).toContain('pnyon');
    expect(message).toContain('The block IS present');
    // The reader is told what they COULD use, so the next step is in the message.
    for (const kind of SYNC_SUPPORTED_TRACKER_KINDS) expect(message).toContain(kind);
    // And it must never claim the block is missing.
    expect(message).not.toContain('has no `roadmap.tracker` block');
  });

  it('reports a malformed statusMap distinctly from a bad kind', () => {
    writeConfig({ ...GITHUB_TRACKER, statusMap: { backlog: 7 } });
    expect(diagnoseTrackerSyncConfig(root)).toEqual({ problem: 'malformed-status-map' });

    writeConfig({ kind: 'github', repo: 'o/r' });
    expect(diagnoseTrackerSyncConfig(root)).toEqual({ problem: 'malformed-status-map' });
  });

  it('reports unparseable JSON rather than treating it as absent', () => {
    fs.writeFileSync(path.join(root, 'harness.config.json'), '{ not json', 'utf-8');
    expect(diagnoseTrackerSyncConfig(root)).toEqual({ problem: 'unreadable-config-file' });
  });

  /**
   * The guard and the diagnosis read the same list, so they cannot drift into
   * disagreeing about which kinds sync accepts — which is how the two config
   * loaders diverged in the first place.
   */
  it('agrees with the loader for every diagnosis', () => {
    const cases: unknown[] = [
      GITHUB_TRACKER,
      { ...GITHUB_TRACKER, kind: 'pnyon' },
      { ...GITHUB_TRACKER, kind: 'linear' },
      { kind: 'github' },
    ];
    for (const tracker of cases) {
      writeConfig(tracker);
      const usable = loadTrackerSyncConfig(root) !== null;
      expect(usable).toBe(diagnoseTrackerSyncConfig(root).problem === 'none');
    }
  });
});
