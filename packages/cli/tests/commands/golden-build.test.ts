import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runGoldenPromote, runGoldenVerify, runGoldenDiff } from '../../src/commands/golden-build';

describe('golden-build runners', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'golden-cli-'));
    configPath = join(dir, 'harness.config.json');
    // The config declares an explicit reference set so the test does not depend
    // on which default reference files happen to exist in the temp dir.
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        golden: { referencePaths: ['coverage-baselines.json'] },
      })
    );
    writeFileSync(join(dir, 'coverage-baselines.json'), '{"lines":90}\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('promote then verify is clean', async () => {
    const promote = await runGoldenPromote({ configPath });
    expect(promote.ok).toBe(true);
    if (!promote.ok) return;
    expect(promote.value.changed).toBe(true);
    expect(promote.value.fileCount).toBe(1);

    const verify = await runGoldenVerify({ configPath });
    expect(verify.ok).toBe(true);
    if (!verify.ok) return;
    expect(verify.value.clean).toBe(true);
  });

  it('verify detects drift after a reference file changes', async () => {
    await runGoldenPromote({ configPath });
    writeFileSync(join(dir, 'coverage-baselines.json'), '{"lines":50}\n');

    const verify = await runGoldenVerify({ configPath });
    expect(verify.ok).toBe(true);
    if (!verify.ok) return;
    expect(verify.value.clean).toBe(false);
    expect(verify.value.diff.changed.map((c) => c.path)).toEqual(['coverage-baselines.json']);
  });

  it('verify errors when no golden has been promoted', async () => {
    const verify = await runGoldenVerify({ configPath });
    expect(verify.ok).toBe(false);
    if (verify.ok) return;
    expect(verify.error.message).toMatch(/no golden build found/i);
  });

  it('diff explains drift but stays advisory (returns Ok even when dirty)', async () => {
    await runGoldenPromote({ configPath });
    writeFileSync(join(dir, 'coverage-baselines.json'), '{"lines":50}\n');

    const diff = await runGoldenDiff({ configPath });
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.value.clean).toBe(false);
    expect(diff.value.diff.changed).toHaveLength(1);
  });

  it('diff returns a null golden (not an error) when none exists', async () => {
    const diff = await runGoldenDiff({ configPath });
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.value.golden).toBeNull();
    expect(diff.value.clean).toBe(true);
  });

  it('--path overrides the configured reference set', async () => {
    writeFileSync(join(dir, 'benchmark-baselines.json'), '{"ops":1}\n');
    const promote = await runGoldenPromote({
      configPath,
      paths: ['benchmark-baselines.json'],
    });
    expect(promote.ok).toBe(true);
    if (!promote.ok) return;
    expect(promote.value.snapshot.files.map((f) => f.path)).toEqual(['benchmark-baselines.json']);
  });
});
