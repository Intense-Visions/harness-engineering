// packages/cli/tests/commands/entry-point-not-found-message.test.ts
//
// Unmocked: the real core analyzer runs over a real temp project. The point is
// what an operator SEES. Every CLI surface prints only `error.message`, so a
// configured entry point that matches no file must be named there — names
// carried only in `details`/`suggestions` never reach the terminal (#2275).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCleanup } from '../../src/commands/cleanup';
import { runCheckPerf } from '../../src/commands/check-perf';

describe('a configured entry point that matches no file is named in CLI output', () => {
  let root: string;
  let configPath: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'harness-ep-not-found-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'index.ts'), 'export const x = 1;\n');
    configPath = join(root, 'harness.config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        name: 'fixture',
        entropy: { entryPoints: ['src/index.ts', 'src/typpo-entropy.ts'] },
        performance: { entryPoints: ['src/index.ts', 'src/typpo-perf.ts'] },
      })
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('cleanup names the missing entropy entry point', async () => {
    const result = await runCleanup({ configPath, type: 'dead-code' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('1 of 2 configured entryPoints match no file');
    expect(result.error.message).toContain('src/typpo-entropy.ts');
    // The entry that resolved is not blamed.
    expect(result.error.message).not.toContain('src/index.ts');
  });

  it('check-perf still runs, and names the missing performance entry point as a warning', async () => {
    const result = await runCheckPerf(root, { configPath });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No perf metric reads entry points, so a typo there must not stop the
    // report: the gate passes on the code it actually measured (#2275 review).
    expect(result.value.valid).toBe(true);
    expect(result.value.stats.filesAnalyzed).toBeGreaterThan(0);
    expect(result.value.violations.some((v) => v.metric === 'analysis-error')).toBe(false);
    // ...but the broken config is still named, at warning severity.
    const warning = result.value.violations.find((v) => v.metric === 'entry-points');
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toContain('1 of 2 configured entryPoints match no file');
    expect(warning?.message).toContain('src/typpo-perf.ts');
  });

  it('check-perf reports no entry-points warning when every entry point resolves', async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        name: 'fixture',
        performance: { entryPoints: ['src/index.ts'] },
      })
    );
    const result = await runCheckPerf(root, { configPath });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.valid).toBe(true);
    expect(result.value.stats.filesAnalyzed).toBeGreaterThan(0);
    expect(result.value.violations.some((v) => v.metric === 'entry-points')).toBe(false);
  });
});
