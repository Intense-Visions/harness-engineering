import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockSpawn = vi.fn();
const mockGetNotification = vi.fn();
const mockEnabled = vi.fn();
const mockShouldRun = vi.fn();
const mockReadState = vi.fn();
const mockExistsSync = vi.fn();

// fs must be mocked (not spied) because ESM module namespaces are not
// configurable — vi.spyOn(fs, 'existsSync') throws "Cannot redefine property".
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: (...a: unknown[]) => mockExistsSync(...a) };
});

vi.mock('../../src/registry/freshness-checker', () => ({
  spawnBackgroundFreshnessCheck: (...a: unknown[]) => mockSpawn(...a),
  getFreshnessNotification: () => mockGetNotification(),
  isFreshnessCheckEnabled: (...a: unknown[]) => mockEnabled(...a),
  shouldRunFreshnessCheck: (...a: unknown[]) => mockShouldRun(...a),
  readFreshnessState: () => mockReadState(),
}));
vi.mock('../../src/bin/update-check-hooks', () => ({
  DEFAULT_INTERVAL_MS: 86_400_000,
  readConfigInterval: () => undefined,
}));
vi.mock('../../src/utils/paths', () => ({
  resolveGlobalSkillsDir: () => '/root/agents/skills/claude-code',
  resolveGlobalCommunityBaseDir: () => '/home/.harness/skills/community',
}));

import { runFreshnessCheckAtStartup, printFreshnessNotification } from '../../src/bin/freshness-check-hooks';

describe('freshness-check-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnabled.mockReturnValue(true);
    mockShouldRun.mockReturnValue(true);
    mockReadState.mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('spawns with existing lockfile paths only', () => {
    mockExistsSync.mockImplementation(
      (p) => String(p) === '/home/.harness/skills/community/skills-lock.json'
    );
    runFreshnessCheckAtStartup();
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledWith(['/home/.harness/skills/community/skills-lock.json']);
  });

  it('does not spawn when no lockfile exists', () => {
    mockExistsSync.mockReturnValue(false);
    runFreshnessCheckAtStartup();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('does not spawn when disabled', () => {
    mockEnabled.mockReturnValue(false);
    mockExistsSync.mockReturnValue(true);
    runFreshnessCheckAtStartup();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('does not spawn when interval has not elapsed', () => {
    mockShouldRun.mockReturnValue(false);
    mockExistsSync.mockReturnValue(true);
    runFreshnessCheckAtStartup();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('swallows errors in startup', () => {
    mockExistsSync.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => runFreshnessCheckAtStartup()).not.toThrow();
  });

  it('prints the notification to stderr when present', () => {
    mockGetNotification.mockReturnValue('1 skill provider has updates — run `harness skill update`');
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    printFreshnessNotification();
    expect(write).toHaveBeenCalledWith(expect.stringContaining('has updates'));
  });

  it('prints nothing when disabled or no notification', () => {
    mockEnabled.mockReturnValue(false);
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    printFreshnessNotification();
    expect(write).not.toHaveBeenCalled();
  });
});
