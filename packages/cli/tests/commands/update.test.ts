import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectPackageManager,
  getInstalledVersion,
  getInstalledPackages,
  createUpdateCommand,
} from '../../src/commands/update';

// Mock node:child_process partially
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

// Mock node:fs partially (other modules depend on fs exports like access)
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    realpathSync: vi.fn(),
  };
});

import { execSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

const mockedExecSync = vi.mocked(execSync);
const mockedRealpathSync = vi.mocked(realpathSync);

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
      mockedExecSync.mockReturnValue(
        JSON.stringify({
          dependencies: {
            '@harness-engineering/cli': { version: '1.2.2' },
          },
        })
      );
      expect(getInstalledVersion('npm')).toBe('1.2.2');
    });

    it('returns null when CLI is not in output', () => {
      mockedExecSync.mockReturnValue(
        JSON.stringify({ dependencies: {} })
      );
      expect(getInstalledVersion('npm')).toBeNull();
    });

    it('returns null when execSync throws', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('command failed');
      });
      expect(getInstalledVersion('npm')).toBeNull();
    });
  });

  describe('getInstalledPackages', () => {
    it('filters for @harness-engineering packages from npm list output', () => {
      mockedExecSync.mockReturnValue(
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
      mockedExecSync.mockReturnValue(
        JSON.stringify({
          dependencies: {
            typescript: { version: '5.4.0' },
          },
        })
      );
      expect(getInstalledPackages('npm')).toEqual([]);
    });

    it('handles missing dependencies key', () => {
      mockedExecSync.mockReturnValue(JSON.stringify({}));
      expect(getInstalledPackages('npm')).toEqual([]);
    });

    it('falls back to default packages when execSync throws', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('command failed');
      });
      expect(getInstalledPackages('npm')).toEqual([
        '@harness-engineering/cli',
        '@harness-engineering/core',
      ]);
    });

    it('passes correct pm to execSync', () => {
      mockedExecSync.mockReturnValue(JSON.stringify({ dependencies: {} }));
      getInstalledPackages('pnpm');
      expect(mockedExecSync).toHaveBeenCalledWith('pnpm list -g --json', expect.any(Object));
    });
  });
});
