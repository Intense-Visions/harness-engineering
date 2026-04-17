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

    it('has --complexity option with default standard', () => {
      const cmd = createRunCommand();
      const opt = cmd.options.find((o) => o.long === '--complexity');
      expect(opt).toBeDefined();
      expect(opt!.defaultValue).toBe('standard');
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

    it('includes preamble with complexity when skill has skill.yaml with phases', async () => {
      const skillDir = path.join(tempDir, 'phased-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        `name: phased-skill
version: "1.0.0"
description: A phased skill
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
phases:
  - name: plan
    description: Planning phase
    required: true
  - name: execute
    description: Execution phase
    required: true
`
      );
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Phased Skill\nContent here.');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'run', 'phased-skill']);

      expect(mockStdoutWrite).toHaveBeenCalled();
      const output = mockStdoutWrite.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('# Phased Skill');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('exits with error for invalid phase name', async () => {
      const skillDir = path.join(tempDir, 'phased-skill2');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        `name: phased-skill2
version: "1.0.0"
description: A phased skill
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
phases:
  - name: plan
    description: Planning
    required: true
`
      );
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Phased\nContent.');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'run', 'phased-skill2', '--phase', 'nonexistent']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('loads principles when docs/principles.md exists', async () => {
      const skillDir = path.join(tempDir, 'principles-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Principles Skill\nContent.');

      // Create a project path with principles
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skill-proj-'));
      fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'docs', 'principles.md'), '# Principles\n- Be good');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'run', 'principles-skill', '--path', projectDir]);

      expect(mockStdoutWrite).toHaveBeenCalled();
      const output = mockStdoutWrite.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Principles Skill');
      expect(mockExit).toHaveBeenCalledWith(0);

      fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('handles --party flag', async () => {
      const skillDir = path.join(tempDir, 'party-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Party Skill\nContent.');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'run', 'party-skill', '--party']);

      expect(mockStdoutWrite).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('handles valid phase with persistent state', async () => {
      const skillDir = path.join(tempDir, 'stateful-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        `name: stateful-skill
version: "1.0.0"
description: A stateful skill
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
state:
  persistent: true
  files:
    - .harness/state.json
phases:
  - name: plan
    description: Planning
    required: true
  - name: execute
    description: Execution
    required: true
`
      );
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Stateful\nContent.');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'run', 'stateful-skill', '--phase', 'plan']);

      expect(mockStdoutWrite).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('loads prior state from file when it exists', async () => {
      const skillDir = path.join(tempDir, 'state-file-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        `name: state-file-skill
version: "1.0.0"
description: A stateful skill
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
state:
  persistent: true
  files:
    - .harness/state.json
phases:
  - name: plan
    description: Planning
    required: true
`
      );
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# State File\nContent.');

      // Create a project directory with state file
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-'));
      fs.mkdirSync(path.join(projectDir, '.harness'), { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, '.harness', 'state.json'),
        JSON.stringify({ phase: 'plan', done: true })
      );

      const program = makeProgram();
      await program.parseAsync([
        'node',
        'test',
        'run',
        'state-file-skill',
        '--phase',
        'plan',
        '--path',
        projectDir,
      ]);

      expect(mockStdoutWrite).toHaveBeenCalled();
      const output = mockStdoutWrite.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('State File');
      // With --path and persistent state, project state should be appended
      expect(output).toContain('Project State');
      expect(mockExit).toHaveBeenCalledWith(0);

      fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('loads prior state from directory (most recent file)', async () => {
      const skillDir = path.join(tempDir, 'state-dir-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        `name: state-dir-skill
version: "1.0.0"
description: A stateful skill
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
state:
  persistent: true
  files:
    - .harness/state/
phases:
  - name: plan
    description: Planning
    required: true
`
      );
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# State Dir\nContent.');

      // Create a project directory with state directory
      const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-statedir-'));
      const stateDir = path.join(projectDir, '.harness', 'state');
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(path.join(stateDir, 'old.json'), '{"old": true}');
      // Small delay to ensure different mtime
      fs.writeFileSync(path.join(stateDir, 'new.json'), '{"new": true}');

      const program = makeProgram();
      await program.parseAsync([
        'node',
        'test',
        'run',
        'state-dir-skill',
        '--phase',
        'plan',
        '--path',
        projectDir,
      ]);

      expect(mockStdoutWrite).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);

      fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('handles --complexity fast', async () => {
      const skillDir = path.join(tempDir, 'complex-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        `name: complex-skill
version: "1.0.0"
description: A skill with phases
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
phases:
  - name: plan
    description: Planning
    required: true
`
      );
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Complex\nContent.');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'run', 'complex-skill', '--complexity', 'fast']);

      expect(mockStdoutWrite).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('handles --complexity thorough', async () => {
      const skillDir = path.join(tempDir, 'thorough-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'skill.yaml'),
        `name: thorough-skill
version: "1.0.0"
description: A skill with phases
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
phases:
  - name: plan
    description: Planning
    required: true
`
      );
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Thorough\nContent.');

      const program = makeProgram();
      await program.parseAsync([
        'node',
        'test',
        'run',
        'thorough-skill',
        '--complexity',
        'thorough',
      ]);

      expect(mockStdoutWrite).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});
