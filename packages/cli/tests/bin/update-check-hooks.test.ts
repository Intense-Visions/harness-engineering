import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @harness-engineering/core
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    VERSION: '1.0.0',
    isUpdateCheckEnabled: vi.fn().mockReturnValue(true),
    shouldRunCheck: vi.fn().mockReturnValue(true),
    readCheckState: vi.fn().mockReturnValue(null),
    spawnBackgroundCheck: vi.fn(),
    getUpdateNotification: vi.fn().mockReturnValue(null),
  };
});

// Mock the config loader
vi.mock('../../src/config/loader', () => ({
  findConfigFile: vi.fn(),
  loadConfig: vi.fn(),
}));

import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
} from '@harness-engineering/core';
import { findConfigFile, loadConfig } from '../../src/config/loader';
import { runUpdateCheckAtStartup, printUpdateNotification } from '../../src/bin/update-check-hooks';

const mockIsUpdateCheckEnabled = vi.mocked(isUpdateCheckEnabled);
const mockShouldRunCheck = vi.mocked(shouldRunCheck);
const mockSpawnBackgroundCheck = vi.mocked(spawnBackgroundCheck);
const mockGetUpdateNotification = vi.mocked(getUpdateNotification);
const mockFindConfigFile = vi.mocked(findConfigFile);
const mockLoadConfig = vi.mocked(loadConfig);

describe('runUpdateCheckAtStartup with config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUpdateCheckEnabled.mockReturnValue(true);
    mockShouldRunCheck.mockReturnValue(true);
    mockSpawnBackgroundCheck.mockReturnValue(undefined);
  });

  it('uses updateCheckInterval from config when present', () => {
    mockFindConfigFile.mockReturnValue({ ok: true, value: '/project/harness.config.json' } as any);
    mockLoadConfig.mockReturnValue({
      ok: true,
      value: {
        version: 1 as const,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        docsDir: './docs',
        updateCheckInterval: 3600000,
      },
    } as any);

    runUpdateCheckAtStartup();

    expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(3600000);
    expect(mockShouldRunCheck).toHaveBeenCalledWith(null, 3600000);
  });

  it('uses default interval when config has no updateCheckInterval', () => {
    mockFindConfigFile.mockReturnValue({ ok: true, value: '/project/harness.config.json' } as any);
    mockLoadConfig.mockReturnValue({
      ok: true,
      value: {
        version: 1 as const,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        docsDir: './docs',
      },
    } as any);

    runUpdateCheckAtStartup();

    expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(undefined);
    expect(mockShouldRunCheck).toHaveBeenCalledWith(null, 86_400_000);
  });

  it('uses default interval when config file is not found', () => {
    mockFindConfigFile.mockReturnValue({ ok: false, error: new Error('not found') } as any);

    runUpdateCheckAtStartup();

    expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(undefined);
    expect(mockShouldRunCheck).toHaveBeenCalledWith(null, 86_400_000);
  });

  it('does not spawn check when isUpdateCheckEnabled returns false', () => {
    mockIsUpdateCheckEnabled.mockReturnValue(false);
    mockFindConfigFile.mockReturnValue({ ok: true, value: '/project/harness.config.json' } as any);
    mockLoadConfig.mockReturnValue({
      ok: true,
      value: {
        version: 1 as const,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        docsDir: './docs',
        updateCheckInterval: 0,
      },
    } as any);

    runUpdateCheckAtStartup();

    expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();
  });
});

describe('printUpdateNotification with config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUpdateCheckEnabled.mockReturnValue(true);
    mockGetUpdateNotification.mockReturnValue(null);
  });

  it('passes config interval to isUpdateCheckEnabled', () => {
    mockFindConfigFile.mockReturnValue({ ok: true, value: '/project/harness.config.json' } as any);
    mockLoadConfig.mockReturnValue({
      ok: true,
      value: {
        version: 1 as const,
        rootDir: '.',
        agentsMapPath: './AGENTS.md',
        docsDir: './docs',
        updateCheckInterval: 7200000,
      },
    } as any);

    printUpdateNotification();

    expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(7200000);
  });

  it('uses default when config is missing', () => {
    mockFindConfigFile.mockReturnValue({ ok: false, error: new Error('not found') } as any);

    printUpdateNotification();

    expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(undefined);
  });
});
