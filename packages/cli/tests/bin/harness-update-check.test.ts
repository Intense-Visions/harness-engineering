import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLI_VERSION } from '../../src/version';

// Mock the core module before importing the function under test
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    isUpdateCheckEnabled: vi.fn(() => true),
    shouldRunCheck: vi.fn(() => false),
    readCheckState: vi.fn(() => null),
    spawnBackgroundCheck: vi.fn(),
    getUpdateNotification: vi.fn(() => null),
  };
});

import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
} from '@harness-engineering/core';
import {
  runUpdateCheckAtStartup,
  printUpdateNotification,
  _resetConfigCache,
} from '../../src/bin/update-check-hooks';

describe('update-check CLI hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetConfigCache();
  });

  describe('runUpdateCheckAtStartup', () => {
    it('calls spawnBackgroundCheck when enabled and shouldRunCheck is true', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(readCheckState).mockReturnValue(null);
      vi.mocked(shouldRunCheck).mockReturnValue(true);

      runUpdateCheckAtStartup();

      expect(isUpdateCheckEnabled).toHaveBeenCalled();
      expect(readCheckState).toHaveBeenCalled();
      expect(shouldRunCheck).toHaveBeenCalled();
      expect(spawnBackgroundCheck).toHaveBeenCalledWith(CLI_VERSION);
    });

    it('does not call spawnBackgroundCheck when isUpdateCheckEnabled returns false', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(false);

      runUpdateCheckAtStartup();

      expect(spawnBackgroundCheck).not.toHaveBeenCalled();
    });

    it('does not call spawnBackgroundCheck when shouldRunCheck returns false', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(readCheckState).mockReturnValue({
        lastCheckTime: Date.now(),
        latestVersion: '1.7.0',
        currentVersion: '1.7.0',
      });
      vi.mocked(shouldRunCheck).mockReturnValue(false);

      runUpdateCheckAtStartup();

      expect(spawnBackgroundCheck).not.toHaveBeenCalled();
    });

    it('does not crash if readCheckState throws unexpectedly', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(readCheckState).mockImplementation(() => {
        throw new Error('unexpected');
      });

      expect(() => runUpdateCheckAtStartup()).not.toThrow();
      expect(spawnBackgroundCheck).not.toHaveBeenCalled();
    });
  });

  describe('printUpdateNotification', () => {
    let stderrSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    it('prints notification to stderr when getUpdateNotification returns a message', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(getUpdateNotification).mockReturnValue(
        'Update available: v1.7.0 -> v1.8.0\nRun "harness update" to upgrade.'
      );

      printUpdateNotification();

      expect(stderrSpy).toHaveBeenCalledWith(
        '\nUpdate available: v1.7.0 -> v1.8.0\nRun "harness update" to upgrade.\n'
      );
    });

    it('does not print when getUpdateNotification returns null', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(getUpdateNotification).mockReturnValue(null);

      printUpdateNotification();

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('does not print when isUpdateCheckEnabled returns false', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(false);

      printUpdateNotification();

      expect(stderrSpy).not.toHaveBeenCalled();
      expect(getUpdateNotification).not.toHaveBeenCalled();
    });

    it('does not crash if getUpdateNotification throws unexpectedly', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(getUpdateNotification).mockImplementation(() => {
        throw new Error('unexpected');
      });

      expect(() => printUpdateNotification()).not.toThrow();
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });
});
