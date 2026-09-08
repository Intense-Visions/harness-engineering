import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  runInstallConstraints,
  createInstallConstraintsCommand,
} from '../../src/commands/install-constraints';
import { logger } from '../../src/output/logger';

function bundle(constraints: Record<string, unknown>, name = 'b'): Record<string, unknown> {
  return {
    name,
    version: '1.0.0',
    manifest: { name, version: '1.0.0', include: ['x'] },
    constraints,
  };
}

describe('applyPackageValue — per-section conflict resolution (--force-package)', () => {
  let tmp: string;
  let configPath: string;
  let lockfilePath: string;
  let bundlePath: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ic-cov-'));
    configPath = path.join(tmp, 'harness.config.json');
    lockfilePath = path.join(tmp, '.harness', 'constraints.lock.json');
    bundlePath = path.join(tmp, 'bundle.json');
    await fs.mkdir(path.join(tmp, '.harness'), { recursive: true });
  });
  afterEach(async () => fs.rm(tmp, { recursive: true, force: true }));

  it('applies package value for a forbiddenImports conflict', async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        name: 'p',
        forbiddenImports: [{ from: 'ui', disallow: ['db'] }],
      })
    );
    await fs.writeFile(
      bundlePath,
      JSON.stringify(bundle({ forbiddenImports: [{ from: 'ui', disallow: ['db', 'net'] }] }))
    );

    const result = await runInstallConstraints({
      source: bundlePath,
      configPath,
      lockfilePath,
      forcePackage: true,
    });
    expect(result.ok).toBe(true);
    const cfg = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const rule = cfg.forbiddenImports.find((r: { from: string }) => r.from === 'ui');
    expect(rule.disallow).toEqual(['db', 'net']);
  });

  it('applies package value for an architecture.thresholds conflict', async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        name: 'p',
        architecture: { thresholds: { maxComplexity: 10 }, modules: {} },
      })
    );
    await fs.writeFile(
      bundlePath,
      JSON.stringify(bundle({ architecture: { thresholds: { maxComplexity: 20 } } }))
    );

    const result = await runInstallConstraints({
      source: bundlePath,
      configPath,
      lockfilePath,
      forcePackage: true,
    });
    expect(result.ok).toBe(true);
    const cfg = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(cfg.architecture.thresholds.maxComplexity).toBe(20);
  });

  it('applies package value for an architecture.modules conflict', async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        name: 'p',
        architecture: { thresholds: {}, modules: { 'src/a': { maxSize: 100 } } },
      })
    );
    await fs.writeFile(
      bundlePath,
      JSON.stringify(bundle({ architecture: { modules: { 'src/a': { maxSize: 200 } } } }))
    );

    const result = await runInstallConstraints({
      source: bundlePath,
      configPath,
      lockfilePath,
      forcePackage: true,
    });
    expect(result.ok).toBe(true);
    const cfg = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(cfg.architecture.modules['src/a'].maxSize).toBe(200);
  });

  it('keeps local values with --force-local on the same conflict', async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        name: 'p',
        architecture: { thresholds: { maxComplexity: 10 }, modules: {} },
      })
    );
    await fs.writeFile(
      bundlePath,
      JSON.stringify(bundle({ architecture: { thresholds: { maxComplexity: 20 } } }))
    );
    const result = await runInstallConstraints({
      source: bundlePath,
      configPath,
      lockfilePath,
      forceLocal: true,
    });
    expect(result.ok).toBe(true);
    const cfg = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(cfg.architecture.thresholds.maxComplexity).toBe(10);
  });

  it('returns an error when the local config is unreadable', async () => {
    // config path points at a directory → read fails
    await fs.mkdir(path.join(tmp, 'cfgdir'));
    await fs.writeFile(
      bundlePath,
      JSON.stringify(bundle({ layers: [{ name: 's', pattern: 'x', allowedDependencies: [] }] }))
    );
    const result = await runInstallConstraints({
      source: bundlePath,
      configPath: path.join(tmp, 'cfgdir'),
      lockfilePath,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Failed to read local config');
  });
});

describe('install-constraints command action', () => {
  let tmp: string;
  let configPath: string;
  let bundlePath: string;
  let logs: Record<string, string[]>;
  let spies: Array<{ mockRestore: () => void }>;
  let exitCode: number | null;
  let exitSpy: { mockRestore: () => void };

  function spyLoggers(): void {
    logs = { info: [], warn: [], success: [], error: [] };
    spies = (['info', 'warn', 'success', 'error'] as const).map((m) =>
      vi.spyOn(logger, m).mockImplementation((msg?: unknown) => {
        logs[m]!.push(String(msg));
      })
    );
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ic-cmd-'));
    configPath = path.join(tmp, 'harness.config.json');
    bundlePath = path.join(tmp, 'bundle.json');
    await fs.mkdir(path.join(tmp, '.harness'), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify({ version: 1, name: 'p', layers: [] }));
    exitCode = null;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      exitCode = c ?? 0;
      throw new Error(`__exit__:${exitCode}`);
    }) as never);
    spyLoggers();
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    spies.forEach((s) => s.mockRestore());
    await fs.rm(tmp, { recursive: true, force: true });
  });

  async function runCmd(args: string[]): Promise<void> {
    try {
      await createInstallConstraintsCommand().parseAsync(args, { from: 'user' });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
  }

  it('errors when both --force-local and --force-package are given', async () => {
    await fs.writeFile(
      bundlePath,
      JSON.stringify(bundle({ layers: [{ name: 's', pattern: 'x', allowedDependencies: [] }] }))
    );
    await runCmd([bundlePath, '-c', configPath, '--force-local', '--force-package']);
    expect(exitCode).toBe(1);
    expect(logs.error.join('\n')).toContain('Cannot use both');
  });

  it('errors and exits when the bundle is missing', async () => {
    await runCmd([path.join(tmp, 'missing.json'), '-c', configPath]);
    expect(exitCode).toBe(1);
    expect(logs.error.join('\n')).toContain('not found');
  });

  it('logs a dry-run report including conflicts', async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        name: 'p',
        layers: [{ name: 's', pattern: 'x', allowedDependencies: [] }],
      })
    );
    await fs.writeFile(
      bundlePath,
      JSON.stringify(
        bundle({ layers: [{ name: 's', pattern: 'x', allowedDependencies: ['core'] }] })
      )
    );
    await runCmd([bundlePath, '-c', configPath, '--dry-run']);
    const joined = logs.info.concat(logs.warn).join('\n');
    expect(joined).toContain('[dry-run]');
    expect(logs.warn.join('\n')).toContain('conflict');
  });

  it('logs a success and reports resolved conflicts with --force-package', async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        name: 'p',
        layers: [{ name: 's', pattern: 'x', allowedDependencies: [] }],
      })
    );
    await fs.writeFile(
      bundlePath,
      JSON.stringify(
        bundle({ layers: [{ name: 's', pattern: 'x', allowedDependencies: ['core'] }] })
      )
    );
    await runCmd([bundlePath, '-c', configPath, '--force-package']);
    expect(logs.success.join('\n')).toContain('Installed');
    expect(logs.warn.join('\n')).toContain('resolved with --force-package');
  });

  it('logs an already-installed no-op on a repeat install', async () => {
    await fs.writeFile(
      bundlePath,
      JSON.stringify(
        bundle({ layers: [{ name: 's', pattern: 'src/**', allowedDependencies: [] }] })
      )
    );
    await runCmd([bundlePath, '-c', configPath]);
    // second run
    logs.info = [];
    await runCmd([bundlePath, '-c', configPath]);
    expect(logs.info.join('\n')).toContain('already installed');
  });

  it('resolves the config via findConfigFile when -c is omitted', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    await fs.writeFile(configPath, JSON.stringify({ version: 1, name: 'p', layers: [] }));
    await fs.writeFile(
      bundlePath,
      JSON.stringify(
        bundle({ layers: [{ name: 's', pattern: 'src/**', allowedDependencies: [] }] })
      )
    );
    await runCmd([bundlePath]);
    cwdSpy.mockRestore();
    expect(logs.success.join('\n')).toContain('Installed');
  });

  it('exits when no config file can be resolved (no -c and none on disk)', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'ic-nocfg-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(empty);
    await fs.writeFile(
      bundlePath,
      JSON.stringify(bundle({ layers: [{ name: 's', pattern: 'x', allowedDependencies: [] }] }))
    );
    await runCmd([bundlePath]);
    cwdSpy.mockRestore();
    fsSync.rmSync(empty, { recursive: true, force: true });
    expect(exitCode).toBe(1);
  });
});
