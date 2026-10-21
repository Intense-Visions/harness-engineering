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

  it('measures a project it can analyse: a dead file makes health FAIL', async () => {
    mkdirSync(join(projectPath, 'src'));
    writeFileSync(
      join(projectPath, 'package.json'),
      JSON.stringify({ name: 'fx', main: 'src/index.ts' })
    );
    writeFileSync(join(projectPath, 'src', 'index.ts'), 'export const main = 1;\n');
    writeFileSync(join(projectPath, 'src', 'orphan.ts'), 'export const orphan = 2;\n');

    const report = await composeInsights(projectPath, {
      skip: ['decay', 'attention', 'impact'],
    });

    expect(report.warnings).toEqual([]);
    expect(report.entropy?.deadFiles).toBe(1);
    expect(report.health?.passed).toBe(false);
  });

  it('a failed entropy analysis is null plus a warning, never zero counts', async () => {
    // Empty project: no entry point resolves, so the analyzer returns Err.
    const report = await composeInsights(projectPath, {
      skip: ['decay', 'attention', 'impact'],
    });

    expect(report.health).toBeNull();
    expect(report.entropy).toBeNull();
    // Sorted: the blocks gather in parallel, so warning order is not fixed.
    expect([...report.warnings].sort()).toEqual([
      expect.stringMatching(/^entropy: entropy analysis failed \(ENTRY_POINT_NOT_FOUND\)/),
      expect.stringMatching(/^health: entropy analysis failed \(ENTRY_POINT_NOT_FOUND\)/),
    ]);
  });

  it('skip=[entropy,health] sets those keys to null', async () => {
    const report = await composeInsights(projectPath, { skip: ['entropy', 'health'] });
    expect(report.entropy).toBeNull();
    expect(report.health).toBeNull();
  });

  it('a failed entropy analysis is reported as unmeasured, never as a health pass', async () => {
    // package.json `main` names an unbuilt artifact and there is no conventional
    // index file, so entry-point resolution fails and the analysis never runs.
    writeFileSync(
      join(projectPath, 'package.json'),
      JSON.stringify({ name: 'stale-main', main: 'dist/index.js' }),
      'utf8'
    );
    mkdirSync(join(projectPath, 'src'), { recursive: true });
    writeFileSync(join(projectPath, 'src', 'lib.ts'), 'export const x = 1;\n', 'utf8');

    const report = await composeInsights(projectPath, { skip: ['decay', 'attention', 'impact'] });

    expect(report.health).toBeNull();
    expect(report.entropy).toBeNull();
    expect(report.warnings.some((w) => w.startsWith('entropy: entropy analysis failed'))).toBe(
      true
    );
    expect(report.warnings.some((w) => w.startsWith('health: entropy analysis failed'))).toBe(true);
  });

  it('a project whose analysis runs still gets an entropy block (positive control)', async () => {
    mkdirSync(join(projectPath, 'src'), { recursive: true });
    writeFileSync(join(projectPath, 'src', 'index.ts'), "export { used } from './lib';\n", 'utf8');
    writeFileSync(
      join(projectPath, 'src', 'lib.ts'),
      'export const used = 1;\nexport const unused = 2;\n',
      'utf8'
    );

    const report = await composeInsights(projectPath, { skip: ['decay', 'attention', 'impact'] });

    expect(report.warnings).toEqual([]);
    expect(report.entropy).not.toBeNull();
    expect(report.entropy!.deadExports).toBeGreaterThan(0);
    expect(report.health?.passed).toBe(false);
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
