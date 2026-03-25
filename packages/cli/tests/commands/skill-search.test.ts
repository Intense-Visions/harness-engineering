import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSearchCommand, runSearch } from '../../src/commands/skill/search';

vi.mock('../../src/registry/npm-client', () => ({
  searchNpmRegistry: vi.fn(),
  extractSkillName: vi.fn((name: string) => name.replace('@harness-skills/', '')),
}));

import { searchNpmRegistry } from '../../src/registry/npm-client';

const mockedSearch = vi.mocked(searchNpmRegistry);

describe('createSearchCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createSearchCommand();
    expect(cmd.name()).toBe('search');
  });

  it('has --platform option', () => {
    const cmd = createSearchCommand();
    const opt = cmd.options.find((o) => o.long === '--platform');
    expect(opt).toBeDefined();
  });

  it('has --trigger option', () => {
    const cmd = createSearchCommand();
    const opt = cmd.options.find((o) => o.long === '--trigger');
    expect(opt).toBeDefined();
  });

  it('has --registry option', () => {
    const cmd = createSearchCommand();
    const opt = cmd.options.find((o) => o.long === '--registry');
    expect(opt).toBeDefined();
  });
});

describe('runSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns search results from npm', async () => {
    mockedSearch.mockResolvedValue([
      {
        name: '@harness-skills/deployment',
        version: '1.0.0',
        description: 'Deployment automation',
        keywords: ['claude-code', 'deployment'],
        date: '2026-03-24',
      },
      {
        name: '@harness-skills/docker-basics',
        version: '0.3.1',
        description: 'Docker fundamentals',
        keywords: ['claude-code', 'docker'],
        date: '2026-03-23',
      },
    ]);

    const results = await runSearch('deploy', {});
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('@harness-skills/deployment');
  });

  it('filters by platform keyword', async () => {
    mockedSearch.mockResolvedValue([
      {
        name: '@harness-skills/deployment',
        version: '1.0.0',
        description: 'Deployment',
        keywords: ['claude-code', 'gemini-cli'],
        date: '2026-03-24',
      },
      {
        name: '@harness-skills/docker-basics',
        version: '0.3.1',
        description: 'Docker',
        keywords: ['claude-code'],
        date: '2026-03-23',
      },
    ]);

    const results = await runSearch('skill', { platform: 'gemini-cli' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('@harness-skills/deployment');
  });

  it('filters by trigger keyword', async () => {
    mockedSearch.mockResolvedValue([
      {
        name: '@harness-skills/deployment',
        version: '1.0.0',
        description: 'Deployment',
        keywords: ['manual', 'claude-code'],
        date: '2026-03-24',
      },
      {
        name: '@harness-skills/linting',
        version: '0.1.0',
        description: 'Linting',
        keywords: ['automatic', 'claude-code'],
        date: '2026-03-23',
      },
    ]);

    const results = await runSearch('skill', { trigger: 'automatic' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('@harness-skills/linting');
  });

  it('returns empty for no matches', async () => {
    mockedSearch.mockResolvedValue([]);
    const results = await runSearch('nonexistent', {});
    expect(results).toHaveLength(0);
  });

  it('passes registry URL to searchNpmRegistry', async () => {
    mockedSearch.mockResolvedValue([]);
    await runSearch('deploy', { registry: 'https://private.example.com' });
    expect(mockedSearch).toHaveBeenCalledWith('deploy', 'https://private.example.com');
  });
});
