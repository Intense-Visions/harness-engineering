import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('fs');
vi.mock('os');

const mockExistsSync = vi.mocked(fs.existsSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockHomedir = vi.mocked(os.homedir);

describe('first-run', () => {
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
  const savedCI = process.env.CI;
  const savedArgv = process.argv;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockHomedir.mockReturnValue('/home/testuser');
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    delete process.env.CI;
    process.argv = ['node', 'harness', 'validate'];
  });

  afterEach(() => {
    stderrWriteSpy.mockRestore();
    if (savedCI !== undefined) {
      process.env.CI = savedCI;
    } else {
      delete process.env.CI;
    }
    process.argv = savedArgv;
  });

  describe('isFirstRun', () => {
    it('returns true when marker file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const { isFirstRun } = await import('../../src/utils/first-run');
      expect(isFirstRun()).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith(
        path.join('/home/testuser', '.harness', '.setup-complete')
      );
    });

    it('returns false when marker file exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const { isFirstRun } = await import('../../src/utils/first-run');
      expect(isFirstRun()).toBe(false);
    });
  });

  describe('markSetupComplete', () => {
    it('creates directory and writes marker file', async () => {
      const { markSetupComplete } = await import('../../src/utils/first-run');
      markSetupComplete();
      expect(mockMkdirSync).toHaveBeenCalledWith(path.join('/home/testuser', '.harness'), {
        recursive: true,
      });
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        path.join('/home/testuser', '.harness', '.setup-complete'),
        '',
        'utf-8'
      );
    });
  });

  describe('printFirstRunWelcome', () => {
    it('prints welcome when first run and not CI and not quiet', async () => {
      mockExistsSync.mockReturnValue(false);
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      printFirstRunWelcome();
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        'Welcome to harness! Run `harness setup` to get started.\n'
      );
    });

    it('does not print when marker exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      printFirstRunWelcome();
      expect(stderrWriteSpy).not.toHaveBeenCalled();
    });

    it('does not print when CI env is set', async () => {
      mockExistsSync.mockReturnValue(false);
      process.env.CI = 'true';
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      printFirstRunWelcome();
      expect(stderrWriteSpy).not.toHaveBeenCalled();
    });

    it('does not print when --quiet is in argv', async () => {
      mockExistsSync.mockReturnValue(false);
      process.argv = ['node', 'harness', '--quiet', 'validate'];
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      printFirstRunWelcome();
      expect(stderrWriteSpy).not.toHaveBeenCalled();
    });

    it('never throws even if fs operations fail', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('EACCES');
      });
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      expect(() => printFirstRunWelcome()).not.toThrow();
    });
  });
});
