import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectPackageManager, createUpdateCommand } from '../../src/commands/update';

// Mock node:fs partially (other modules depend on fs exports like access)
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    realpathSync: vi.fn(),
  };
});

import { realpathSync } from 'node:fs';

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
});
