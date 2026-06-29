import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Command } from 'commander';

// Regression test for issue #587:
//   `skill info` / `skill run` must resolve project-local skills the same way
//   `skill list --local` does. Before the fix, info/run resolved only from
//   `resolveSkillsDir()` (compiled-module-location first), so a project-local
//   skill under <cwd>/agents/skills/claude-code/<name>/ was listable but
//   reported "Skill not found" by info/run.
//
// This suite intentionally does NOT mock src/utils/paths — it exercises the
// real resolution chain so a revert to single-source resolution fails it.

import { createInfoCommand } from '../../src/commands/skill/info';
import { createRunCommand } from '../../src/commands/skill/run';

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockStdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

const SKILL_NAME = 'demo-local-587';
const skillYaml = `name: ${SKILL_NAME}
version: "1.0.0"
description: A project-local demo skill
triggers: [manual]
platforms: [claude-code]
tools: [Read]
type: flexible
`;

function infoProgram(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  program.addCommand(createInfoCommand());
  return program;
}

function runProgram(): Command {
  const program = new Command();
  program.addCommand(createRunCommand());
  return program;
}

describe('skill info/run resolve project-local skills (#587)', () => {
  let projectDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-local-587-'));
    const skillDir = path.join(projectDir, 'agents', 'skills', 'claude-code', SKILL_NAME);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'skill.yaml'), skillYaml);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${SKILL_NAME}\nlocal body\n`);
    // Simulate running the CLI from the consuming project root.
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
    mockExit.mockClear();
    mockConsoleLog.mockClear();
    mockStdoutWrite.mockClear();
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('skill info resolves a project-local skill by name', async () => {
    await infoProgram().parseAsync(['node', 'test', 'info', SKILL_NAME]);

    const output = mockConsoleLog.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain(SKILL_NAME);
    expect(output).toContain('A project-local demo skill');
    expect(mockExit).toHaveBeenCalledWith(0);
    expect(mockExit).not.toHaveBeenCalledWith(2);
  });

  it('skill run resolves a project-local skill by name', async () => {
    await runProgram().parseAsync(['node', 'test', 'run', SKILL_NAME]);

    const output = mockStdoutWrite.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain(`# ${SKILL_NAME}`);
    expect(output).toContain('local body');
    expect(mockExit).toHaveBeenCalledWith(0);
    expect(mockExit).not.toHaveBeenCalledWith(2);
  });
});
