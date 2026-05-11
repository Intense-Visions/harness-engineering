/**
 * Phase 4 / Task 11: assert that `handleManageRoadmap` dispatches to the
 * file-less helper when `roadmap.mode === 'file-less'` instead of throwing
 * the Phase 3 stub error.
 *
 * The integration here is intentionally minimal: we don't supply a tracker
 * stub, so `createTrackerClient` will return the canonical "missing GitHub
 * token" error when no `GITHUB_TOKEN` env is set. That error is observable
 * proof the dispatch reached the file-less branch (Phase 3 stub would have
 * thrown a different message before any tracker code ran).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';

describe('manage_roadmap — Phase 4 file-less dispatch', () => {
  let dir: string;
  let prevToken: string | undefined;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-disp-'));
    prevToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (prevToken !== undefined) process.env.GITHUB_TOKEN = prevToken;
  });

  it('dispatches to the file-less helper (no stub throw) when mode is file-less', async () => {
    // Provide `tracker.repo` so we get past the cleanup-batch-2 empty-repo
    // guard (commit ca163ebc) in `loadTrackerClientConfigFromProject` —
    // the intent of THIS test is to assert dispatch to the file-less
    // branch, not to exercise config-validation errors. The missing-token
    // error from `createTrackerClient` is what proves the dispatch landed.
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        roadmap: {
          mode: 'file-less',
          tracker: {
            kind: 'github',
            repo: 'owner/repo',
            statusMap: { 'in-progress': 'open' },
          },
        },
      })
    );
    // No GITHUB_TOKEN -> createTrackerClient should fail with a specific
    // message; observing that message proves we reached the file-less
    // dispatch (not the old Phase 3 stub throw).
    const res = await handleManageRoadmap({ path: dir, action: 'show' });
    expect(res.isError).toBe(true);
    const text = res.content?.[0]?.text ?? '';
    expect(text).not.toMatch(/not yet wired/);
    expect(text).toMatch(/(GITHUB_TOKEN|missing GitHub token|github-issues|file-less tracker)/i);
  });

  it('file-backed regression: falls through to file-backed path when mode is absent', async () => {
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    const res = await handleManageRoadmap({ path: dir, action: 'show' });
    expect(res.isError).toBe(true);
    const text = res.content?.[0]?.text ?? '';
    expect(text).toMatch(/docs\/roadmap\.md not found/);
    expect(text).not.toMatch(/not yet wired/);
  });
});
