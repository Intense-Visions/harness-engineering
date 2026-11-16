// packages/cli/tests/commands/check-perf-exclusions.test.ts
//
// Unmocked: the real core analyzer runs over a real temp git repo. check-perf
// must analyse the same files its sibling `cleanup` does and the same files a
// clean CI checkout has:
//   - #2077: paths listed in `entropy.excludePatterns` are not analysed
//   - #2331: gitignored paths are not analysed, so a local working tree full
//            of ignored build output gets the same verdict as CI
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheckPerf } from '../../src/commands/check-perf';

/** A function far over the default cyclomatic-complexity error threshold (15). */
function overComplexSource(name: string): string {
  const branches = Array.from(
    { length: 40 },
    (_, i) =>
      `  if (a === ${i}) { if (a > ${i}) { r += ${i}; } else if (a < ${i}) { r -= ${i}; } }\n`
  ).join('');
  return `export function ${name}(a: number): number {\n  let r = 0;\n${branches}  return r;\n}\n`;
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

/** Files (posix-relative) that carry a complexity violation. */
function complexityFiles(violations: Array<{ metric: string; file: string }>): string[] {
  return violations
    .filter((v) => v.metric.startsWith('cyclomatic') || v.metric.includes('complexity'))
    .map((v) => v.file.replaceAll('\\', '/'));
}

describe('check-perf honours the same exclusions as cleanup and CI (#2077, #2331)', () => {
  let root: string;
  let configPath: string;

  async function writeConfig(entropy: Record<string, unknown> = {}): Promise<void> {
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        name: 'fixture',
        entropy: { entryPoints: ['src/index.ts'], ...entropy },
      })
    );
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'harness-perf-exclusions-'));
    configPath = join(root, 'harness.config.json');
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'index.ts'), 'export const x = 1;\n');
    await writeFile(join(root, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
    git(root, ['init', '-q']);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('control: an over-complex function in an ordinary source dir IS reported', async () => {
    await writeConfig();
    await writeFile(join(root, 'src', 'big.ts'), overComplexSource('big'));

    const result = await runCheckPerf(root, { configPath, structural: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.valid).toBe(false);
    expect(complexityFiles(result.value.violations).some((f) => f.endsWith('src/big.ts'))).toBe(
      true
    );
  });

  it('does not analyse a gitignored directory (#2331)', async () => {
    await writeConfig();
    await writeFile(join(root, '.gitignore'), '/ignored/\n');
    await mkdir(join(root, 'ignored'), { recursive: true });
    await writeFile(join(root, 'ignored', 'gen.ts'), overComplexSource('big'));

    const result = await runCheckPerf(root, { configPath, structural: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(complexityFiles(result.value.violations)).toEqual([]);
    expect(result.value.valid).toBe(true);
    // The tracked source is still measured — the gate did not go blind.
    expect(result.value.stats.filesAnalyzed).toBeGreaterThan(0);
  });

  it('does not analyse a gitignored file matched by a nested .gitignore (#2331)', async () => {
    await writeConfig();
    await mkdir(join(root, 'src', 'gen'), { recursive: true });
    await writeFile(join(root, 'src', 'gen', '.gitignore'), '*.ts\n');
    await writeFile(join(root, 'src', 'gen', 'bundle.ts'), overComplexSource('big'));

    const result = await runCheckPerf(root, { configPath, structural: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(complexityFiles(result.value.violations)).toEqual([]);
  });

  it('still analyses a TRACKED file under an ignored path, as a CI checkout would', async () => {
    await writeConfig();
    await writeFile(join(root, '.gitignore'), '/vendor-src/\n');
    await mkdir(join(root, 'vendor-src'), { recursive: true });
    await writeFile(join(root, 'vendor-src', 'tracked.ts'), overComplexSource('big'));
    git(root, ['add', '-f', 'vendor-src/tracked.ts']);

    const result = await runCheckPerf(root, { configPath, structural: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      complexityFiles(result.value.violations).some((f) => f.endsWith('vendor-src/tracked.ts'))
    ).toBe(true);
  });

  it('does not analyse a directory listed in entropy.excludePatterns (#2077)', async () => {
    await writeConfig({ excludePatterns: ['**/node_modules/**', 'generated/**'] });
    await mkdir(join(root, 'generated'), { recursive: true });
    await writeFile(join(root, 'generated', 'page-objects.ts'), overComplexSource('big'));

    const result = await runCheckPerf(root, { configPath, structural: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(complexityFiles(result.value.violations)).toEqual([]);
    expect(result.value.valid).toBe(true);
    expect(result.value.stats.filesAnalyzed).toBeGreaterThan(0);
  });

  it('still runs outside a git repository', async () => {
    await rm(join(root, '.git'), { recursive: true, force: true });
    await writeConfig();
    await writeFile(join(root, 'src', 'big.ts'), overComplexSource('big'));

    const result = await runCheckPerf(root, { configPath, structural: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(complexityFiles(result.value.violations).some((f) => f.endsWith('src/big.ts'))).toBe(
      true
    );
  });
});
