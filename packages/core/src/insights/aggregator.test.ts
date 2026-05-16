import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { composeInsights } from './aggregator';

describe('composeInsights', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'hermes-insights-'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('returns all five top-level keys plus warnings on an empty project', async () => {
    const report = await composeInsights(projectPath);
    expect(report).toHaveProperty('health');
    expect(report).toHaveProperty('entropy');
    expect(report).toHaveProperty('decay');
    expect(report).toHaveProperty('attention');
    expect(report).toHaveProperty('impact');
    expect(report.warnings).toBeInstanceOf(Array);
    expect(typeof report.generatedAt).toBe('string');
  });

  it('skip=[entropy,health] sets those keys to null', async () => {
    const report = await composeInsights(projectPath, { skip: ['entropy', 'health'] });
    expect(report.entropy).toBeNull();
    expect(report.health).toBeNull();
  });

  it('attention block counts active vs stale session directories', async () => {
    const sessionsDir = join(projectPath, '.harness', 'sessions');
    const freshDir = join(sessionsDir, 'fresh-session');
    const staleDir = join(sessionsDir, 'stale-session');
    mkdirSync(freshDir, { recursive: true });
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(join(freshDir, 'note.md'), 'x');
    writeFileSync(join(staleDir, 'note.md'), 'x');
    // Stamp staleDir as ~14 days old.
    const old = (Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(staleDir, old, old);

    const report = await composeInsights(projectPath, {
      skip: ['health', 'entropy', 'decay', 'impact'],
    });
    expect(report.attention?.activeThreadCount).toBeGreaterThanOrEqual(1);
    expect(report.attention?.staleThreadCount).toBeGreaterThanOrEqual(1);
  });

  it('project.name surfaces when package.json present', async () => {
    writeFileSync(
      join(projectPath, 'package.json'),
      JSON.stringify({ name: 'test-project' }),
      'utf8'
    );
    const report = await composeInsights(projectPath, {
      skip: ['health', 'entropy', 'decay', 'attention', 'impact'],
    });
    expect(report.project.name).toBe('test-project');
  });
});
