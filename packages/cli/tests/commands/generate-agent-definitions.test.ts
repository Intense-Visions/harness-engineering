import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Command } from 'commander';
import {
  generateAgentDefinitions,
  createGenerateAgentDefinitionsCommand,
} from '../../src/commands/generate-agent-definitions';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-def-cmd-test-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateAgentDefinitions', () => {
  it('generates agent files for all personas', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    expect(results.length).toBe(1);
    expect(results[0]!.added.length).toBeGreaterThan(0);
    // Verify files were written
    const outputDir = path.join(tmpDir, 'claude-code');
    const files = fs.readdirSync(outputDir);
    expect(files.some((f) => f.startsWith('harness-'))).toBe(true);
  });

  it('generates harness-prefixed filenames', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    for (const filename of results[0]!.added) {
      expect(filename).toMatch(/^harness-.*\.md$/);
    }
  });

  it('dry run does not write files', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: true,
    });
    expect(results[0]!.added.length).toBeGreaterThan(0);
    const outputDir = path.join(tmpDir, 'claude-code');
    expect(fs.existsSync(outputDir)).toBe(false);
  });

  it('generates for both platforms', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code', 'gemini-cli'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    expect(results.length).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, 'claude-code'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'gemini-cli'))).toBe(true);
  });

  it('second run detects unchanged files', () => {
    generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    expect(results[0]!.unchanged.length).toBeGreaterThan(0);
    expect(results[0]!.added.length).toBe(0);
  });

  it('generates one file per persona', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    // 12 personas = 12 agent files
    expect(results[0]!.added.length).toBe(12);
  });
});

describe('createGenerateAgentDefinitionsCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createGenerateAgentDefinitionsCommand();
    expect(cmd.name()).toBe('generate-agent-definitions');
  });

  it('has --platforms option with default', () => {
    const cmd = createGenerateAgentDefinitionsCommand();
    const opt = cmd.options.find((o) => o.long === '--platforms');
    expect(opt).toBeDefined();
    expect(opt?.defaultValue).toBe('claude-code,gemini-cli');
  });

  it('has --global, --output, and --dry-run options', () => {
    const cmd = createGenerateAgentDefinitionsCommand();
    const longs = cmd.options.map((o) => o.long);
    expect(longs).toContain('--global');
    expect(longs).toContain('--output');
    expect(longs).toContain('--dry-run');
  });
});

describe('action handler', () => {
  const exitError = new Error('process.exit');
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockExit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw exitError;
    }) as never);
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  async function safeParseAsync(program: Command, args: string[]) {
    try {
      await program.parseAsync(args);
    } catch (e) {
      if (e !== exitError) throw e;
    }
  }

  function makeProgram(): Command {
    const program = new Command();
    program.option('--json', 'JSON output');
    program.addCommand(createGenerateAgentDefinitionsCommand());
    return program;
  }

  it('generates agent definitions via command with --output and --dry-run', async () => {
    const program = makeProgram();
    await safeParseAsync(program, [
      'node',
      'test',
      'generate-agent-definitions',
      '--output',
      tmpDir,
      '--dry-run',
    ]);

    // Should print platform results
    expect(mockConsoleLog).toHaveBeenCalled();
  });

  it('outputs JSON when --json is set', async () => {
    const program = makeProgram();
    await safeParseAsync(program, [
      'node',
      'test',
      '--json',
      'generate-agent-definitions',
      '--output',
      tmpDir,
      '--dry-run',
    ]);

    expect(mockConsoleLog).toHaveBeenCalled();
    const output = mockConsoleLog.mock.calls[0]?.[0];
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('exits with error for invalid platform', async () => {
    const program = makeProgram();
    await safeParseAsync(program, [
      'node',
      'test',
      'generate-agent-definitions',
      '--platforms',
      'invalid-platform',
      '--output',
      tmpDir,
    ]);

    expect(mockExit).toHaveBeenCalled();
  });

  it('generates for single platform', async () => {
    const program = makeProgram();
    await safeParseAsync(program, [
      'node',
      'test',
      'generate-agent-definitions',
      '--platforms',
      'claude-code',
      '--output',
      tmpDir,
    ]);

    // Should print results
    expect(mockConsoleLog).toHaveBeenCalled();
  });
});
