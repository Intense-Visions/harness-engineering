import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import {
  detectPackageManager,
  getInstalledVersion,
  getInstalledVersions,
  getInstalledPackages,
  getLatestVersion,
  getLatestVersionAsync,
  createUpdateCommand,
} from '../../src/commands/update';

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
import { realpathSync } from 'node:fs';

const mockedExecFileSync = vi.mocked(execFileSync);
const mockedRealpathSync = vi.mocked(realpathSync);
const mockedExecFile = vi.mocked(execFile);

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

    it('returns null when CLI is not in output', () => {
      mockedExecFileSync.mockReturnValue(JSON.stringify({ dependencies: {} }));
      expect(getInstalledVersion('npm')).toBeNull();
    });

    it('returns null when execFileSync throws', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('command failed');
      });
      expect(getInstalledVersion('npm')).toBeNull();
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

    it('returns all nulls when execFileSync throws', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('command failed');
      });
      const versions = getInstalledVersions('npm', [
        '@harness-engineering/cli',
        '@harness-engineering/core',
      ]);
      expect(versions['@harness-engineering/cli']).toBeNull();
      expect(versions['@harness-engineering/core']).toBeNull();
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

    it('returns empty array when no harness packages are installed', () => {
      mockedExecFileSync.mockReturnValue(
        JSON.stringify({
          dependencies: {
            typescript: { version: '5.4.0' },
          },
        })
      );
      expect(getInstalledPackages('npm')).toEqual([]);
    });

    it('handles missing dependencies key', () => {
      mockedExecFileSync.mockReturnValue(JSON.stringify({}));
      expect(getInstalledPackages('npm')).toEqual([]);
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
