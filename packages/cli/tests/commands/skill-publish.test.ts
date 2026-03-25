import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPublishCommand, runPublish } from '../../src/commands/skill/publish';

vi.mock('../../src/registry/validator', () => ({
  validateForPublish: vi.fn(),
}));

vi.mock('../../src/skill/package-json', () => ({
  derivePackageJson: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => '# skill\n'),
    existsSync: vi.fn(() => true),
  };
});

import { validateForPublish } from '../../src/registry/validator';
import { derivePackageJson } from '../../src/skill/package-json';
import { execFileSync } from 'child_process';
import * as fs from 'fs';

const mockedValidate = vi.mocked(validateForPublish);
const mockedDerivePackageJson = vi.mocked(derivePackageJson);
const mockedExecFileSync = vi.mocked(execFileSync);
const mockedWriteFileSync = vi.mocked(fs.writeFileSync);

describe('createPublishCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createPublishCommand();
    expect(cmd.name()).toBe('publish');
  });

  it('has --dry-run option', () => {
    const cmd = createPublishCommand();
    const opt = cmd.options.find((o) => o.long === '--dry-run');
    expect(opt).toBeDefined();
  });

  it('has --registry option', () => {
    const cmd = createPublishCommand();
    const opt = cmd.options.find((o) => o.long === '--registry');
    expect(opt).toBeDefined();
  });
});

describe('runPublish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes successfully after validation', async () => {
    mockedValidate.mockResolvedValue({
      valid: true,
      errors: [],
      skillMeta: {
        name: 'my-skill',
        version: '1.0.0',
        description: 'A skill',
        platforms: ['claude-code'],
        triggers: ['manual'],
        type: 'flexible',
        tools: [],
        depends_on: [],
      },
    });
    mockedDerivePackageJson.mockReturnValue({
      name: '@harness-skills/my-skill',
      version: '1.0.0',
      description: 'A skill',
      keywords: ['harness-skill', 'claude-code', 'manual'],
      files: ['skill.yaml', 'SKILL.md', 'README.md'],
      license: 'MIT',
    });

    const result = await runPublish('/path/to/skill', {});
    expect(result.published).toBe(true);
    expect(result.name).toBe('@harness-skills/my-skill');
    expect(result.version).toBe('1.0.0');
    expect(mockedWriteFileSync).toHaveBeenCalled(); // package.json written
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public'],
      expect.any(Object)
    );
  });

  it('rejects when validation fails', async () => {
    mockedValidate.mockResolvedValue({
      valid: false,
      errors: ['description must not be empty', 'SKILL.md must contain a "## Process" section'],
    });

    await expect(runPublish('/path/to/skill', {})).rejects.toThrow('Pre-publish validation failed');
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it('passes --registry to npm publish', async () => {
    mockedValidate.mockResolvedValue({
      valid: true,
      errors: [],
      skillMeta: {
        name: 'my-skill',
        version: '1.0.0',
        description: 'A skill',
        platforms: ['claude-code'],
        triggers: ['manual'],
        type: 'flexible',
        tools: [],
        depends_on: [],
      },
    });
    mockedDerivePackageJson.mockReturnValue({
      name: '@harness-skills/my-skill',
      version: '1.0.0',
      description: 'A skill',
      keywords: ['harness-skill', 'claude-code', 'manual'],
      files: ['skill.yaml', 'SKILL.md', 'README.md'],
      license: 'MIT',
    });

    const result = await runPublish('/path/to/skill', { registry: 'https://private.example.com' });
    expect(result.published).toBe(true);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'npm',
      ['publish', '--access', 'public', '--registry', 'https://private.example.com'],
      expect.any(Object)
    );
  });

  it('skips npm publish on --dry-run', async () => {
    mockedValidate.mockResolvedValue({
      valid: true,
      errors: [],
      skillMeta: {
        name: 'my-skill',
        version: '1.0.0',
        description: 'A skill',
        platforms: ['claude-code'],
        triggers: ['manual'],
        type: 'flexible',
        tools: [],
        depends_on: [],
      },
    });
    mockedDerivePackageJson.mockReturnValue({
      name: '@harness-skills/my-skill',
      version: '1.0.0',
      description: 'A skill',
      keywords: ['harness-skill'],
      files: ['skill.yaml', 'SKILL.md', 'README.md'],
      license: 'MIT',
    });

    const result = await runPublish('/path/to/skill', { dryRun: true });
    expect(result.published).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });
});
