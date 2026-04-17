import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

vi.mock('@harness-engineering/core', () => ({
  parseManifest: vi.fn(),
  extractBundle: vi.fn(),
  writeConfig: vi.fn(),
}));

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn(),
}));

vi.mock('../../src/output/logger', () => ({
  logger: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import { parseManifest, extractBundle, writeConfig } from '@harness-engineering/core';
import { resolveConfig } from '../../src/config/loader';
import { logger } from '../../src/output/logger';
import { createShareCommand } from '../../src/commands/share';

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedParseYaml = vi.mocked(parseYaml);
const mockedParseManifest = vi.mocked(parseManifest);
const mockedExtractBundle = vi.mocked(extractBundle);
const mockedWriteConfig = vi.mocked(writeConfig);
const mockedResolveConfig = vi.mocked(resolveConfig);

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.addCommand(createShareCommand());
  return program;
}

describe('share command', () => {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createShareCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createShareCommand();
      expect(cmd.name()).toBe('share');
    });

    it('has -o, --output option', () => {
      const cmd = createShareCommand();
      const opt = cmd.options.find((o) => o.long === '--output');
      expect(opt).toBeDefined();
    });
  });

  describe('runShareAction via parseAsync', () => {
    it('exits with error when constraints.yaml does not exist', async () => {
      mockedExistsSync.mockReturnValue(false);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'share', '/tmp/project'])).rejects.toThrow(
        'process.exit'
      );

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No constraints.yaml'));
    });

    it('exits with error when YAML parsing fails', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('invalid: yaml: bad');
      mockedParseYaml.mockImplementation(() => {
        throw new Error('YAML parse error');
      });

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'share', '/tmp/project'])).rejects.toThrow(
        'process.exit'
      );

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read constraints.yaml')
      );
    });

    it('exits with error when manifest parsing fails', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('name: test');
      mockedParseYaml.mockReturnValue({ name: 'test' });
      mockedParseManifest.mockReturnValue({ ok: false, error: 'Invalid manifest' } as any);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'share', '/tmp/project'])).rejects.toThrow(
        'process.exit'
      );

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid constraints.yaml')
      );
    });

    it('exits with error when config resolution fails', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('name: test');
      mockedParseYaml.mockReturnValue({ name: 'test' });
      mockedParseManifest.mockReturnValue({
        ok: true,
        value: { name: 'test', include: ['*'] },
      } as any);
      mockedResolveConfig.mockReturnValue({
        ok: false,
        error: new Error('No config found'),
      } as any);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'share', '/tmp/project'])).rejects.toThrow(
        'process.exit'
      );

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits with error when bundle extraction fails', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('name: test');
      mockedParseYaml.mockReturnValue({ name: 'test' });
      mockedParseManifest.mockReturnValue({
        ok: true,
        value: { name: 'test', include: ['*'] },
      } as any);
      mockedResolveConfig.mockReturnValue({
        ok: true,
        value: { architecture: {} },
      } as any);
      mockedExtractBundle.mockReturnValue({
        ok: false,
        error: 'Missing sections',
      } as any);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'share', '/tmp/project'])).rejects.toThrow(
        'process.exit'
      );

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to extract bundle')
      );
    });

    it('exits with error when bundle has no constraints', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('name: test');
      mockedParseYaml.mockReturnValue({ name: 'test' });
      mockedParseManifest.mockReturnValue({
        ok: true,
        value: { name: 'test', include: ['*'] },
      } as any);
      mockedResolveConfig.mockReturnValue({
        ok: true,
        value: { architecture: {} },
      } as any);
      mockedExtractBundle.mockReturnValue({
        ok: true,
        value: { constraints: {} },
      } as any);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'share', '/tmp/project'])).rejects.toThrow(
        'process.exit'
      );

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No constraints found'));
    });

    it('exits with error when writeConfig fails', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('name: test');
      mockedParseYaml.mockReturnValue({ name: 'test' });
      mockedParseManifest.mockReturnValue({
        ok: true,
        value: { name: 'test', include: ['*'] },
      } as any);
      mockedResolveConfig.mockReturnValue({
        ok: true,
        value: { architecture: {} },
      } as any);
      mockedExtractBundle.mockReturnValue({
        ok: true,
        value: { constraints: { 'layer-violations': { max: 0 } } },
      } as any);
      mockedWriteConfig.mockResolvedValue({
        ok: false,
        error: new Error('write failed'),
      } as any);

      const program = createProgram();
      await expect(program.parseAsync(['node', 'test', 'share', '/tmp/project'])).rejects.toThrow(
        'process.exit'
      );

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to write bundle'));
    });

    it('writes bundle successfully', async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('name: test');
      mockedParseYaml.mockReturnValue({ name: 'test' });
      mockedParseManifest.mockReturnValue({
        ok: true,
        value: { name: 'test', include: ['*'] },
      } as any);
      mockedResolveConfig.mockReturnValue({
        ok: true,
        value: { architecture: {} },
      } as any);
      mockedExtractBundle.mockReturnValue({
        ok: true,
        value: { constraints: { 'layer-violations': { max: 0 } } },
      } as any);
      mockedWriteConfig.mockResolvedValue({ ok: true, value: undefined } as any);

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'share', '/tmp/project']);

      expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('Bundle written'));
    });
  });
});
