import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Command } from 'commander';

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

let mockSkillsDir = '';
vi.mock('../../src/utils/paths', () => ({
  resolveSkillsDir: () => mockSkillsDir,
}));

import { createInfoCommand } from '../../src/commands/skill/info';

function makeProgram(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  program.option('--quiet', 'Quiet mode');
  program.addCommand(createInfoCommand());
  return program;
}

const validSkillYaml = `name: test-skill
version: "1.0.0"
description: A test skill
triggers: [manual]
platforms: [claude-code]
tools: [Read, Write]
type: flexible
`;

const validSkillYamlWithPhases = `name: phase-skill
version: "2.0.0"
description: A skill with phases
triggers: [manual, on_commit]
platforms: [claude-code, cursor]
tools: [Read, Write, Bash]
type: rigid
phases:
  - name: plan
    description: Planning phase
  - name: execute
    description: Execution phase
depends_on:
  - base-skill
state:
  persistent: true
`;

describe('skill info command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skill-info-'));
    mockSkillsDir = tempDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createInfoCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createInfoCommand();
      expect(cmd.name()).toBe('info');
    });

    it('has required name argument', () => {
      const cmd = createInfoCommand();
      const args = cmd.registeredArguments;
      expect(args.length).toBeGreaterThan(0);
      expect(args[0]!.name()).toBe('name');
    });
  });

  describe('action', () => {
    it('exits with error when skill directory does not exist', async () => {
      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'info', 'nonexistent-skill']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('exits with error when skill.yaml does not exist', async () => {
      const skillDir = path.join(tempDir, 'no-yaml-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'info', 'no-yaml-skill']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('prints skill info when skill exists', async () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), validSkillYaml);

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'info', 'test-skill']);

      const output = mockConsoleLog.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('test-skill');
      expect(output).toContain('1.0.0');
      expect(output).toContain('flexible');
      expect(output).toContain('A test skill');
      expect(output).toContain('Read, Write');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('prints phases when present', async () => {
      const skillDir = path.join(tempDir, 'phase-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), validSkillYamlWithPhases);

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'info', 'phase-skill']);

      const output = mockConsoleLog.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Phases');
      expect(output).toContain('plan');
      expect(output).toContain('execute');
      expect(output).toContain('Depends on');
      expect(output).toContain('base-skill');
      expect(output).toContain('Persistent');
    });

    it('outputs JSON when --json flag is set', async () => {
      const skillDir = path.join(tempDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), validSkillYaml);

      const program = makeProgram();
      await program.parseAsync(['node', 'test', '--json', 'info', 'test-skill']);

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('exits with error when skill.yaml is invalid', async () => {
      const skillDir = path.join(tempDir, 'bad-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'not: valid: yaml: [[[');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'info', 'bad-skill']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('exits with error when skill.yaml fails schema validation', async () => {
      const skillDir = path.join(tempDir, 'bad-schema-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'name: test\n# missing required fields');

      const program = makeProgram();
      await program.parseAsync(['node', 'test', 'info', 'bad-schema-skill']);

      expect(mockExit).toHaveBeenCalledWith(2);
    });
  });
});
