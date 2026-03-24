import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBundledSkillNames } from '../../src/registry/bundled-skills';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  };
});

import * as fs from 'fs';

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReaddirSync = vi.mocked(fs.readdirSync);
const mockedStatSync = vi.mocked(fs.statSync);

describe('getBundledSkillNames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns skill directory names from a given skills dir', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'harness-tdd',
      'harness-planning',
      'cleanup-dead-code',
    ] as unknown as fs.Dirent[]);
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);

    const names = getBundledSkillNames('/path/to/skills/claude-code');
    expect(names).toContain('harness-tdd');
    expect(names).toContain('harness-planning');
    expect(names).toContain('cleanup-dead-code');
    expect(names.size).toBe(3);
  });

  it('returns empty set when directory does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    const names = getBundledSkillNames('/nonexistent');
    expect(names.size).toBe(0);
  });
});
