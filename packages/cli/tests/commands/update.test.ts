import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import {
  detectPackageManager,
  detectPackageManagerFromPath,
  findAllInstalls,
  getActiveInstallDir,
  getInstalledVersion,
  getInstalledVersions,
  getInstalledPackages,
  getLatestVersion,
  getLatestVersionAsync,
  createUpdateCommand,
} from '../../src/commands/update';
import { CLI_VERSION } from '../../src/version';

// Mock node:child_process partially
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: vi.fn(),
    execFile: vi.fn(),
  };
});

// Mock node:fs partially (other modules depend on fs exports like access)
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    realpathSync: vi.fn(),
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
  };
});

// Mock readline to avoid interactive prompts
vi.mock('node:readline', () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: vi.fn((_q: string, cb: (answer: string) => void) => {
        cb('n'); // Always answer 'n' to skip regeneration
      }),
      close: vi.fn(),
    })),
  },
}));

// Mock telemetry wizard
vi.mock('../../src/commands/telemetry-wizard', () => ({
  ensureTelemetryConfigured: vi.fn().mockResolvedValue({ status: 'pass', message: 'OK' }),
}));

// Mock hooks init
vi.mock('../../src/commands/hooks/init', () => ({
  initHooks: vi.fn(() => ({ copiedScripts: [] })),
}));

import { execFileSync, execFile } from 'node:child_process';
import { realpathSync, existsSync, readFileSync } from 'node:fs';

const mockedExecFileSync = vi.mocked(execFileSync);
const mockedRealpathSync = vi.mocked(realpathSync);
const mockedExecFile = vi.mocked(execFile);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  program.option('--verbose', 'Verbose output');
  program.option('--quiet', 'Quiet output');
  program.option('--config <path>', 'Config path');
  program.addCommand(createUpdateCommand());
  return program;
}

describe('update command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUpdateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createUpdateCommand();
      expect(cmd.name()).toBe('update');
    });

    it('has --version option', () => {
      const cmd = createUpdateCommand();
      const opt = cmd.options.find((o) => o.long === '--version');
      expect(opt).toBeDefined();
    });

    it('has --force option', () => {
      const cmd = createUpdateCommand();
      const opt = cmd.options.find((o) => o.long === '--force');
      expect(opt).toBeDefined();
    });

    it('has --regenerate option', () => {
      const cmd = createUpdateCommand();
      const opt = cmd.options.find((o) => o.long === '--regenerate');
      expect(opt).toBeDefined();
    });

    it('has description', () => {
      const cmd = createUpdateCommand();
      expect(cmd.description()).toContain('Update');
    });
  });

  describe('detectPackageManager', () => {
    it('detects npm from path containing /lib/node_modules/', () => {
      mockedRealpathSync.mockReturnValue(
        '/usr/local/lib/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      expect(detectPackageManager()).toBe('npm');
    });

    it('detects pnpm from path containing pnpm/global/', () => {
      mockedRealpathSync.mockReturnValue(
        '/home/user/.local/share/pnpm/global/5/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      expect(detectPackageManager()).toBe('pnpm');
    });

    it('detects pnpm from path containing pnpm-global/', () => {
      mockedRealpathSync.mockReturnValue(
        '/home/user/pnpm-global/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      expect(detectPackageManager()).toBe('pnpm');
    });

    it('detects yarn from path containing .yarn/', () => {
      mockedRealpathSync.mockReturnValue(
        '/home/user/.yarn/global/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      expect(detectPackageManager()).toBe('yarn');
    });

    it('falls back to npm when path has no recognizable pattern', () => {
      mockedRealpathSync.mockReturnValue('/some/unknown/path/harness.js');
      expect(detectPackageManager()).toBe('npm');
    });

    it('falls back to npm when realpathSync throws', () => {
      mockedRealpathSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(detectPackageManager()).toBe('npm');
    });
  });

  describe('detectPackageManagerFromPath', () => {
    it('classifies npm-style global layout', () => {
      expect(
        detectPackageManagerFromPath(
          '/opt/homebrew/lib/node_modules/@harness-engineering/cli/dist/bin/harness.js'
        )
      ).toBe('npm');
    });

    it('classifies pnpm global layout', () => {
      expect(
        detectPackageManagerFromPath(
          '/home/user/.local/share/pnpm/global/5/node_modules/@harness-engineering/cli/dist/bin/harness.js'
        )
      ).toBe('pnpm');
    });

    it('classifies yarn global layout', () => {
      expect(
        detectPackageManagerFromPath(
          '/home/user/.yarn/global/node_modules/@harness-engineering/cli/dist/bin/harness.js'
        )
      ).toBe('yarn');
    });
  });

  describe('findAllInstalls', () => {
    function harnessPkgJson(version: string): string {
      return JSON.stringify({ name: '@harness-engineering/cli', version });
    }

    // `path.join` produces backslashes on Windows but the test inputs use POSIX
    // separators. Normalize both sides so the mocks match regardless of host
    // separator — the production code already handles separator differences.
    const toPosix = (p: string): string => p.replace(/\\/g, '/');

    // Helper: configures fs mocks so package.json lookups only succeed at
    // the given package root directories (one per install). Mirrors real
    // npm layout where intermediate dirs like `cli/dist/bin` have no
    // package.json.
    function mockPackageRoots(roots: Record<string, string>): void {
      mockedExistsSync.mockImplementation((p) => {
        const s = toPosix(String(p));
        return Object.keys(roots).some((root) => s === `${root}/package.json`);
      });
      mockedReadFileSync.mockImplementation((p) => {
        const s = toPosix(String(p));
        for (const [root, pkg] of Object.entries(roots)) {
          if (s === `${root}/package.json`) return pkg;
        }
        throw new Error(`unexpected readFileSync: ${s}`);
      });
    }

    it('returns empty array when which/where command throws', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('command not found');
      });
      expect(findAllInstalls()).toEqual([]);
    });

    it('returns empty array when execFileSync returns a non-string (mocked default)', () => {
      mockedExecFileSync.mockReturnValueOnce(undefined as any);
      expect(findAllInstalls()).toEqual([]);
    });

    it('returns one install for a single binary on PATH', () => {
      mockedExecFileSync.mockReturnValueOnce('/Users/me/.nvm/versions/node/v20.0.0/bin/harness\n');
      mockedRealpathSync.mockReturnValue(
        '/Users/me/.nvm/versions/node/v20.0.0/lib/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      mockPackageRoots({
        '/Users/me/.nvm/versions/node/v20.0.0/lib/node_modules/@harness-engineering/cli':
          harnessPkgJson('2.4.0'),
      });

      const installs = findAllInstalls();
      expect(installs).toHaveLength(1);
      expect(installs[0]).toBeDefined();
      expect(installs[0]?.binPath).toBe('/Users/me/.nvm/versions/node/v20.0.0/bin/harness');
      expect(installs[0]?.version).toBe('2.4.0');
      expect(installs[0]?.packageManager).toBe('npm');
      expect(toPosix(installs[0]!.prefix ?? '')).toBe('/Users/me/.nvm/versions/node/v20.0.0');
    });

    it('surfaces multiple installs at different versions (the duplicate-install hazard)', () => {
      // Reproduces the field scenario: harness installed via both nvm and
      // homebrew, `which -a` returns both, and they're at different versions.
      mockedExecFileSync.mockReturnValueOnce(
        '/Users/me/.nvm/versions/node/v20.0.0/bin/harness\n' + '/opt/homebrew/bin/harness\n'
      );
      mockedRealpathSync
        .mockReturnValueOnce(
          '/Users/me/.nvm/versions/node/v20.0.0/lib/node_modules/@harness-engineering/cli/dist/bin/harness.js'
        )
        .mockReturnValueOnce(
          '/opt/homebrew/lib/node_modules/@harness-engineering/cli/dist/bin/harness.js'
        );
      mockPackageRoots({
        '/Users/me/.nvm/versions/node/v20.0.0/lib/node_modules/@harness-engineering/cli':
          harnessPkgJson('2.4.0'),
        '/opt/homebrew/lib/node_modules/@harness-engineering/cli': harnessPkgJson('2.3.0'),
      });

      const installs = findAllInstalls();
      expect(installs).toHaveLength(2);
      expect(installs.map((i) => i.version)).toEqual(['2.4.0', '2.3.0']);
      expect(toPosix(installs[0]!.prefix ?? '')).toBe('/Users/me/.nvm/versions/node/v20.0.0');
      expect(toPosix(installs[1]!.prefix ?? '')).toBe('/opt/homebrew');
    });

    it('deduplicates entries that realpath to the same target', () => {
      mockedExecFileSync.mockReturnValueOnce('/usr/local/bin/harness\n/opt/homebrew/bin/harness\n');
      // Both PATH entries are symlinks pointing to the same actual binary.
      mockedRealpathSync.mockReturnValue(
        '/opt/homebrew/lib/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      mockPackageRoots({
        '/opt/homebrew/lib/node_modules/@harness-engineering/cli': harnessPkgJson('2.4.0'),
      });

      const installs = findAllInstalls();
      expect(installs).toHaveLength(1);
    });

    it('skips entries whose package.json is missing or unparseable', () => {
      mockedExecFileSync.mockReturnValueOnce('/some/orphan/bin/harness\n');
      mockedRealpathSync.mockReturnValue('/some/orphan/bin/harness.js');
      mockedExistsSync.mockReturnValue(false);

      expect(findAllInstalls()).toEqual([]);
    });
  });

  describe('getActiveInstallDir', () => {
    it('returns null when realpathSync throws', () => {
      mockedRealpathSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(getActiveInstallDir()).toBeNull();
    });

    it('returns the install dir for the currently-running binary', () => {
      mockedRealpathSync.mockReturnValue(
        '/opt/homebrew/lib/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      const pkgRoot = '/opt/homebrew/lib/node_modules/@harness-engineering/cli';
      // Production code calls existsSync with a `path.join`-formed path that
      // uses backslashes on Windows. Normalize before comparing so the test
      // works on every host OS.
      mockedExistsSync.mockImplementation(
        (p) => String(p).replace(/\\/g, '/') === `${pkgRoot}/package.json`
      );
      mockedReadFileSync.mockReturnValue(
        JSON.stringify({ name: '@harness-engineering/cli', version: '2.3.0' })
      );
      const result = getActiveInstallDir();
      expect(result).not.toBeNull();
      expect(result!.replace(/\\/g, '/')).toBe(pkgRoot);
    });
  });

  describe('getInstalledVersion', () => {
    it('returns CLI version from pm list output', () => {
      mockedExecFileSync.mockReturnValue(
        JSON.stringify({
          dependencies: {
            '@harness-engineering/cli': { version: '1.2.2' },
          },
        })
      );
      expect(getInstalledVersion('npm')).toBe('1.2.2');
    });

    it('falls back to CLI_VERSION when npm list does not include the CLI (#317)', () => {
      // Reproduces issue #317: harness installed via Homebrew/bun/asdf or
      // under a different nvm prefix — `npm list -g` returns no harness deps,
      // but the CLI is actually running at CLI_VERSION.
      mockedExecFileSync.mockReturnValue(JSON.stringify({ dependencies: {} }));
      expect(getInstalledVersion('npm')).toBe(CLI_VERSION);
    });

    it('falls back to CLI_VERSION when execFileSync throws (#317)', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('command failed');
      });
      expect(getInstalledVersion('npm')).toBe(CLI_VERSION);
    });
  });

  describe('getInstalledVersions', () => {
    it('returns versions for all requested packages', () => {
      mockedExecFileSync.mockReturnValue(
        JSON.stringify({
          dependencies: {
            '@harness-engineering/cli': { version: '1.24.0' },
            '@harness-engineering/core': { version: '0.21.3' },
          },
        })
      );
      const versions = getInstalledVersions('npm', [
        '@harness-engineering/cli',
        '@harness-engineering/core',
      ]);
      expect(versions).toEqual({
        '@harness-engineering/cli': '1.24.0',
        '@harness-engineering/core': '0.21.3',
      });
    });

    it('returns null for packages not in global list', () => {
      mockedExecFileSync.mockReturnValue(
        JSON.stringify({
          dependencies: {
            '@harness-engineering/cli': { version: '1.24.0' },
          },
        })
      );
      const versions = getInstalledVersions('npm', [
        '@harness-engineering/cli',
        '@harness-engineering/core',
      ]);
      expect(versions['@harness-engineering/cli']).toBe('1.24.0');
      expect(versions['@harness-engineering/core']).toBeNull();
    });

    it('returns CLI_VERSION for cli and null for other pkgs when execFileSync throws (#317)', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('command failed');
      });
      const versions = getInstalledVersions('npm', [
        '@harness-engineering/cli',
        '@harness-engineering/core',
      ]);
      // CLI is always present (we are running it), so the fallback uses
      // CLI_VERSION rather than null.
      expect(versions['@harness-engineering/cli']).toBe(CLI_VERSION);
      expect(versions['@harness-engineering/core']).toBeNull();
    });

    it('falls back to CLI_VERSION when npm list -g returns no harness packages (#317)', () => {
      // Reproduces issue #317: `npm list -g --json` returns only npm/corepack
      // because harness was installed against a different prefix.
      mockedExecFileSync.mockReturnValue(
        JSON.stringify({
          dependencies: {
            corepack: { version: '0.34.6' },
            npm: { version: '11.12.1' },
          },
        })
      );
      const versions = getInstalledVersions('npm', ['@harness-engineering/cli']);
      expect(versions['@harness-engineering/cli']).toBe(CLI_VERSION);
    });
  });

  describe('getInstalledPackages', () => {
    it('filters for @harness-engineering packages from npm list output', () => {
      mockedExecFileSync.mockReturnValue(
        JSON.stringify({
          dependencies: {
            '@harness-engineering/cli': { version: '1.2.2' },
            '@harness-engineering/core': { version: '0.6.0' },
            '@harness-engineering/mcp-server': { version: '0.3.2' },
            typescript: { version: '5.4.0' },
          },
        })
      );
      const packages = getInstalledPackages('npm');
      expect(packages).toEqual([
        '@harness-engineering/cli',
        '@harness-engineering/core',
        '@harness-engineering/mcp-server',
      ]);
      expect(packages).not.toContain('typescript');
    });

    it('always includes the running CLI even when npm list -g does not (#317)', () => {
      // Reproduces issue #317: harness installed via Homebrew / bun / asdf
      // or a different nvm prefix — `npm list -g` doesn't see it.
      mockedExecFileSync.mockReturnValue(
        JSON.stringify({
          dependencies: {
            typescript: { version: '5.4.0' },
          },
        })
      );
      const packages = getInstalledPackages('npm');
      expect(packages).toContain('@harness-engineering/cli');
      expect(packages).not.toContain('typescript');
    });

    it('handles missing dependencies key and still includes the CLI (#317)', () => {
      mockedExecFileSync.mockReturnValue(JSON.stringify({}));
      expect(getInstalledPackages('npm')).toEqual(['@harness-engineering/cli']);
    });

    it('falls back to default packages when execFileSync throws', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('command failed');
      });
      expect(getInstalledPackages('npm')).toEqual([
        '@harness-engineering/cli',
        '@harness-engineering/core',
      ]);
    });

    it('passes correct pm to execFileSync', () => {
      mockedExecFileSync.mockReturnValue(JSON.stringify({ dependencies: {} }));
      getInstalledPackages('pnpm');
      expect(mockedExecFileSync).toHaveBeenCalledWith(
        'pnpm',
        ['list', '-g', '--json'],
        expect.any(Object)
      );
    });
  });

  describe('getLatestVersion', () => {
    it('returns trimmed version string from npm view', () => {
      mockedExecFileSync.mockReturnValue('1.25.0\n');
      const version = getLatestVersion();
      expect(version).toBe('1.25.0');
      expect(mockedExecFileSync).toHaveBeenCalledWith(
        'npm',
        ['view', '@harness-engineering/cli', 'dist-tags.latest'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 15000 })
      );
    });

    it('uses custom package name when provided', () => {
      mockedExecFileSync.mockReturnValue('0.21.3\n');
      const version = getLatestVersion('@harness-engineering/core');
      expect(version).toBe('0.21.3');
      expect(mockedExecFileSync).toHaveBeenCalledWith(
        'npm',
        ['view', '@harness-engineering/core', 'dist-tags.latest'],
        expect.any(Object)
      );
    });

    it('trims whitespace from output', () => {
      mockedExecFileSync.mockReturnValue('  2.0.0-beta.1  \n');
      expect(getLatestVersion()).toBe('2.0.0-beta.1');
    });

    it('throws when execFileSync throws', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('npm not found');
      });
      expect(() => getLatestVersion()).toThrow('npm not found');
    });
  });

  describe('getLatestVersionAsync', () => {
    it('returns trimmed version from npm view', async () => {
      mockedExecFile.mockImplementation(((
        _cmd: unknown,
        _args: unknown,
        _opts: unknown,
        cb?: Function
      ) => {
        if (cb) cb(null, { stdout: '1.25.0\n', stderr: '' });
        return {} as ReturnType<typeof execFile>;
      }) as typeof execFile);
      const version = await getLatestVersionAsync('@harness-engineering/cli');
      expect(version).toBe('1.25.0');
    });

    it('rejects when execFile fails', async () => {
      mockedExecFile.mockImplementation(((
        _cmd: unknown,
        _args: unknown,
        _opts: unknown,
        cb?: Function
      ) => {
        if (cb) cb(new Error('network error'), { stdout: '', stderr: '' });
        return {} as ReturnType<typeof execFile>;
      }) as typeof execFile);
      await expect(getLatestVersionAsync('@harness-engineering/cli')).rejects.toThrow(
        'network error'
      );
    });

    it('trims whitespace from stdout', async () => {
      mockedExecFile.mockImplementation(((
        _cmd: unknown,
        _args: unknown,
        _opts: unknown,
        cb?: Function
      ) => {
        if (cb) cb(null, { stdout: '  3.0.0  \n', stderr: '' });
        return {} as ReturnType<typeof execFile>;
      }) as typeof execFile);
      const version = await getLatestVersionAsync('@harness-engineering/core');
      expect(version).toBe('3.0.0');
    });
  });

  describe('runUpdateAction via command parseAsync', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.clearAllMocks();
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      // Default: detectPackageManager returns npm
      mockedRealpathSync.mockReturnValue('/usr/local/lib/node_modules/harness/bin.js');
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('runs --force update successfully', async () => {
      // getInstalledPackages
      mockedExecFileSync
        .mockReturnValueOnce(
          JSON.stringify({
            dependencies: {
              '@harness-engineering/cli': { version: '1.0.0' },
            },
          })
        )
        // install -g succeeds (stdio inherit returns undefined)
        .mockReturnValueOnce(undefined as any);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'update', '--force'])).rejects.toThrow(
        'process.exit'
      );

      // Should have called install
      const installCall = mockedExecFileSync.mock.calls.find(
        (c) => c[1] && Array.isArray(c[1]) && c[1].includes('install')
      );
      expect(installCall).toBeDefined();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('handles install failure with --force', async () => {
      // getInstalledPackages
      mockedExecFileSync
        .mockReturnValueOnce(
          JSON.stringify({
            dependencies: {
              '@harness-engineering/cli': { version: '1.0.0' },
            },
          })
        )
        // install -g fails
        .mockImplementationOnce(() => {
          throw new Error('install failed');
        });

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'update', '--force'])).rejects.toThrow(
        'process.exit'
      );

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('reports all packages up to date when no updates available', async () => {
      // getInstalledPackages
      mockedExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          dependencies: {
            '@harness-engineering/cli': { version: '1.0.0' },
          },
        })
      );
      // getInstalledVersions
      mockedExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          dependencies: {
            '@harness-engineering/cli': { version: '1.0.0' },
          },
        })
      );

      // getLatestVersionAsync: mock execFile to return same version
      mockedExecFile.mockImplementation(((
        _cmd: unknown,
        _args: unknown,
        _opts: unknown,
        cb?: Function
      ) => {
        if (cb) cb(null, { stdout: '1.0.0\n', stderr: '' });
        return {} as ReturnType<typeof execFile>;
      }) as typeof execFile);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'update'])).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('detects outdated packages and runs install', async () => {
      // getInstalledPackages
      mockedExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          dependencies: {
            '@harness-engineering/cli': { version: '1.0.0' },
          },
        })
      );
      // getInstalledVersions
      mockedExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          dependencies: {
            '@harness-engineering/cli': { version: '1.0.0' },
          },
        })
      );
      // install -g succeeds
      mockedExecFileSync.mockReturnValueOnce(undefined as any);

      // getLatestVersionAsync: newer version
      mockedExecFile.mockImplementation(((
        _cmd: unknown,
        _args: unknown,
        _opts: unknown,
        cb?: Function
      ) => {
        if (cb) cb(null, { stdout: '2.0.0\n', stderr: '' });
        return {} as ReturnType<typeof execFile>;
      }) as typeof execFile);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'update'])).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('uses --version flag to pin CLI version', async () => {
      // getInstalledPackages
      mockedExecFileSync
        .mockReturnValueOnce(
          JSON.stringify({
            dependencies: {
              '@harness-engineering/cli': { version: '1.0.0' },
              '@harness-engineering/core': { version: '1.0.0' },
            },
          })
        )
        // install succeeds
        .mockReturnValueOnce(undefined as any);

      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', 'update', '--version', '1.5.0', '--force'])
      ).rejects.toThrow('process.exit');

      // Verify the install call has pinned version for CLI
      const installCall = mockedExecFileSync.mock.calls.find(
        (c) => c[1] && Array.isArray(c[1]) && c[1].includes('install')
      );
      expect(installCall).toBeDefined();
      const args = installCall![1] as string[];
      expect(args.some((a) => a === '@harness-engineering/cli@1.5.0')).toBe(true);
      expect(args.some((a) => a === '@harness-engineering/core@latest')).toBe(true);
    });

    it('detects outdated CLI even when npm list -g does not include it (#317)', async () => {
      // Reproduces issue #317. Before the fix: `getInstalledPackages` returns
      // an empty array because `npm list -g` doesn't see the Homebrew/bun/
      // multi-prefix-nvm install, `checkAllPackages` has nothing to compare,
      // and the user is told "All packages are up to date" even though the
      // registry has a newer version.

      // getInstalledPackages: `npm list -g --json` lists only npm + corepack
      mockedExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          dependencies: {
            corepack: { version: '0.34.6' },
            npm: { version: '11.12.1' },
          },
        })
      );
      // getInstalledVersions: same shape — cli not present in npm list output
      mockedExecFileSync.mockReturnValueOnce(
        JSON.stringify({
          dependencies: {
            corepack: { version: '0.34.6' },
            npm: { version: '11.12.1' },
          },
        })
      );
      // install -g succeeds
      mockedExecFileSync.mockReturnValueOnce(undefined as any);

      // npm view reports a version newer than CLI_VERSION
      const newerVersion = `${parseInt(CLI_VERSION.split('.')[0]!, 10) + 1}.0.0`;
      mockedExecFile.mockImplementation(((
        _cmd: unknown,
        _args: unknown,
        _opts: unknown,
        cb?: Function
      ) => {
        if (cb) cb(null, { stdout: `${newerVersion}\n`, stderr: '' });
        return {} as ReturnType<typeof execFile>;
      }) as typeof execFile);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'update'])).rejects.toThrow('process.exit');

      // The fix means we reach the install path instead of the false
      // "up to date" branch.
      const installCall = mockedExecFileSync.mock.calls.find(
        (c) => c[1] && Array.isArray(c[1]) && c[1].includes('install')
      );
      expect(installCall).toBeDefined();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('uses verbose mode to log extra info', async () => {
      mockedExecFileSync
        .mockReturnValueOnce(
          JSON.stringify({
            dependencies: {
              '@harness-engineering/cli': { version: '1.0.0' },
            },
          })
        )
        .mockReturnValueOnce(undefined as any);

      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', '--verbose', 'update', '--force'])
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});
