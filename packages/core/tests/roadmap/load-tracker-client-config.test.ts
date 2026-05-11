import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadTrackerClientConfigFromProject } from '../../src/roadmap/load-tracker-client-config';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'load-trackercfg-'));
}

describe('loadTrackerClientConfigFromProject', () => {
  it('returns Err when harness.config.json is missing', () => {
    const dir = tmp();
    const result = loadTrackerClientConfigFromProject(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/not found/i);
  });

  it('returns Err when roadmap.tracker is absent', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ docsDir: 'docs' }));
    const result = loadTrackerClientConfigFromProject(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/tracker config missing/i);
  });

  it('returns Err when tracker.kind is not "github"', () => {
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ roadmap: { tracker: { kind: 'jira', repo: 'x/y' } } })
    );
    const result = loadTrackerClientConfigFromProject(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/only supports kind/i);
  });

  it('returns Ok with mapped kind "github-issues" when config is valid', () => {
    const dir = tmp();
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({ roadmap: { tracker: { kind: 'github', repo: 'owner/repo' } } })
    );
    const result = loadTrackerClientConfigFromProject(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('github-issues');
      expect(result.value.repo).toBe('owner/repo');
    }
  });
});
