/**
 * The row-scoped tracker push: outcome classification and the adapter
 * injection seam. No network — every tracker interaction goes through a stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { triggerScopedExternalSync } from '../../../src/mcp/tools/roadmap-auto-sync';

const TRACKER_CONFIG = {
  roadmap: {
    tracker: {
      kind: 'github',
      repo: 'owner/repo',
      labels: ['harness-managed'],
      statusMap: {
        backlog: 'open',
        planned: 'open',
        'in-progress': 'open',
        done: 'closed',
        blocked: 'open',
      },
      reverseStatusMap: { open: 'planned', closed: 'done' },
    },
  },
};

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-link-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('triggerScopedExternalSync() — outcome classification', () => {
  it('returns not-configured when the project has no tracker config', async () => {
    const outcome = await triggerScopedExternalSync(dir, 'Anything');
    expect(outcome).toEqual({ kind: 'not-configured' });
  });

  it('returns no-token when a tracker is configured but GITHUB_TOKEN is absent', async () => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify(TRACKER_CONFIG),
      'utf-8'
    );
    vi.stubEnv('GITHUB_TOKEN', '');

    const outcome = await triggerScopedExternalSync(dir, 'Anything');

    expect(outcome).toEqual({ kind: 'no-token' });
  });
});
