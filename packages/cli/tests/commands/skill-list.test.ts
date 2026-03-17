import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

let mockSkillsDir = '';
vi.mock('../../src/utils/paths', () => ({
  resolveSkillsDir: () => mockSkillsDir,
}));

import { createListCommand } from '../../src/commands/skill/list';

const VALID_SKILL_YAML = `name: test-skill
version: "1.0.0"
description: A test skill for testing
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
`;

function makeProgram(globalOpts: Record<string, unknown> = {}): Command {
  const program = new Command();
  for (const [key, val] of Object.entries(globalOpts)) {
    if (typeof val === 'boolean') {
      program.option(`--${key}`);
      if (val) program.setOptionValue(key, true);
    }
  }
  program.addCommand(createListCommand());
  return program;
}

describe('skill list command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skill-list-'));
    mockSkillsDir = tempDir;
    mockExit.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createListCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createListCommand();
      expect(cmd.name()).toBe('list');
    });
  });

  describe('action', () => {
    it('exits successfully when no skills directory exists', async () => {
      mockSkillsDir = path.join(tempDir, 'nonexistent');
      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'list']);

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('reports no skills when directory is empty', async () => {
      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'list']);

      expect(mockExit).toHaveBeenCalledWith(0);
      const output = mockConsoleLog.mock.calls.flat().join(' ');
      expect(output).toContain('No skills found');
    });

    it('lists skills with valid skill.yaml files', async () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), VALID_SKILL_YAML);

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'list']);

      expect(mockExit).toHaveBeenCalledWith(0);
      const output = mockConsoleLog.mock.calls.flat().join(' ');
      expect(output).toContain('test-skill');
    });

    it('outputs JSON when --json flag is set', async () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), VALID_SKILL_YAML);

      const program = makeProgram({ json: true });
      await program.parseAsync(['node', 'test', '--json', 'list']);

      expect(mockExit).toHaveBeenCalledWith(0);
      const jsonOutput = mockConsoleLog.mock.calls.flat().join('');
      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe('test-skill');
    });

    it('outputs only names in quiet mode', async () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), VALID_SKILL_YAML);

      const program = makeProgram({ quiet: true });
      await program.parseAsync(['node', 'test', '--quiet', 'list']);

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockConsoleLog).toHaveBeenCalledWith('test-skill');
    });

    it('skips directories without skill.yaml', async () => {
      fs.mkdirSync(path.join(tempDir, 'no-yaml-dir'));

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'list']);

      const output = mockConsoleLog.mock.calls.flat().join(' ');
      expect(output).toContain('No skills found');
    });

    it('skips directories with invalid skill.yaml', async () => {
      const skillDir = path.join(tempDir, 'bad-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'invalid: yaml: content: [');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'list']);

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});
