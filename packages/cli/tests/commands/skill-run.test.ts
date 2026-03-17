import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock process.exit to prevent test runner from exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const mockStdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock resolveSkillsDir to use our temp dir
let mockSkillsDir = '';
vi.mock('../../src/utils/paths', () => ({
  resolveSkillsDir: () => mockSkillsDir,
}));

import { createRunCommand } from '../../src/commands/skill/run';

function makeProgram(): Command {
  const program = new Command();
  program.addCommand(createRunCommand());
  return program;
}

describe('skill run command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skill-run-'));
    mockSkillsDir = tempDir;
    mockExit.mockClear();
    mockStdoutWrite.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createRunCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createRunCommand();
      expect(cmd.name()).toBe('run');
    });

    it('has required argument for skill name', () => {
      const cmd = createRunCommand();
      const args = cmd.registeredArguments;
      expect(args.length).toBeGreaterThan(0);
      expect(args[0]!.name()).toBe('name');
    });

    it('has --path option', () => {
      const cmd = createRunCommand();
      const opt = cmd.options.find((o) => o.long === '--path');
      expect(opt).toBeDefined();
    });

    it('has --complexity option with default auto', () => {
      const cmd = createRunCommand();
      const opt = cmd.options.find((o) => o.long === '--complexity');
      expect(opt).toBeDefined();
      expect(opt!.defaultValue).toBe('auto');
    });

    it('has --phase option', () => {
      const cmd = createRunCommand();
      const opt = cmd.options.find((o) => o.long === '--phase');
      expect(opt).toBeDefined();
    });

    it('has --party option', () => {
      const cmd = createRunCommand();
      const opt = cmd.options.find((o) => o.long === '--party');
      expect(opt).toBeDefined();
    });
  });

  describe('action', () => {
    it('exits with error when skill directory does not exist', async () => {
      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'run', 'nonexistent-skill']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('exits with error when SKILL.md is missing', async () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        `name: test-skill
version: "1.0.0"
description: A test skill
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
`
      );

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'run', 'test-skill']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('outputs SKILL.md content when skill exists', async () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill\nContent here.');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'run', 'test-skill']);

      expect(mockStdoutWrite).toHaveBeenCalled();
      const output = mockStdoutWrite.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('# Test Skill');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});
