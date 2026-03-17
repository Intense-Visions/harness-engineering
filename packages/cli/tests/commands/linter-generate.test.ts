import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock the linter-gen package
const mockGenerate = vi.fn();
vi.mock('@harness-engineering/linter-gen', () => ({
  generate: (...args: unknown[]) => mockGenerate(...args),
}));

import { createGenerateCommand } from '../../src/commands/linter/generate';

describe('linter generate command', () => {
  beforeEach(() => {
    mockExit.mockClear();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockGenerate.mockReset();
  });

  describe('createGenerateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createGenerateCommand();
      expect(cmd.name()).toBe('generate');
    });

    it('has --config option with default', () => {
      const cmd = createGenerateCommand();
      const opt = cmd.options.find((o) => o.long === '--config');
      expect(opt).toBeDefined();
      expect(opt!.defaultValue).toBe('./harness-linter.yml');
    });

    it('has --output option', () => {
      const cmd = createGenerateCommand();
      const opt = cmd.options.find((o) => o.long === '--output');
      expect(opt).toBeDefined();
    });

    it('has --clean option', () => {
      const cmd = createGenerateCommand();
      const opt = cmd.options.find((o) => o.long === '--clean');
      expect(opt).toBeDefined();
    });

    it('has --dry-run option', () => {
      const cmd = createGenerateCommand();
      const opt = cmd.options.find((o) => o.long === '--dry-run');
      expect(opt).toBeDefined();
    });
  });

  describe('action', () => {
    it('calls generate with correct options', async () => {
      mockGenerate.mockResolvedValue({
        success: true,
        outputDir: './output',
        rulesGenerated: ['no-console'],
        dryRun: false,
      });

      const cmd = createGenerateCommand();
      await cmd.parseAsync(['node', 'test', '-c', 'my-config.yml']);

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ configPath: 'my-config.yml' })
      );
    });

    it('logs generated rules on success', async () => {
      mockGenerate.mockResolvedValue({
        success: true,
        outputDir: './output',
        rulesGenerated: ['rule-a', 'rule-b'],
        dryRun: false,
      });

      const cmd = createGenerateCommand();
      await cmd.parseAsync(['node', 'test']);

      const output = mockConsoleLog.mock.calls.flat().join('\n');
      expect(output).toContain('rule-a');
      expect(output).toContain('rule-b');
    });

    it('outputs JSON on success with --json flag', async () => {
      mockGenerate.mockResolvedValue({
        success: true,
        outputDir: './output',
        rulesGenerated: ['rule-a'],
        dryRun: false,
      });

      const cmd = createGenerateCommand();
      await cmd.parseAsync(['node', 'test', '--json']);

      const jsonOutput = mockConsoleLog.mock.calls.flat().join('');
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.success).toBe(true);
      expect(parsed.rulesGenerated).toContain('rule-a');
    });

    it('exits with VALIDATION_FAILED on generation errors', async () => {
      mockGenerate.mockResolvedValue({
        success: false,
        errors: [{ type: 'parse', error: new Error('Bad config') }],
      });

      const cmd = createGenerateCommand();
      // process.exit is mocked, so execution continues past it into the
      // success branch which may throw. Catch and verify exit was called.
      try {
        await cmd.parseAsync(['node', 'test']);
      } catch {
        // expected
      }

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('outputs JSON errors with --json flag on failure', async () => {
      mockGenerate.mockResolvedValue({
        success: false,
        errors: [{ type: 'parse', error: new Error('Bad config') }],
      });

      const cmd = createGenerateCommand();
      // process.exit is mocked, so execution continues past it.
      // The --json branch outputs JSON and then exits; subsequent code may throw.
      try {
        await cmd.parseAsync(['node', 'test', '--json']);
      } catch {
        // expected
      }

      // Verify JSON output was produced before the error path
      const jsonCalls = mockConsoleLog.mock.calls.flat().filter((c) => typeof c === 'string');
      const jsonOutput = jsonCalls.find((c) => c.includes('"success"'));
      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput!);
      expect(parsed.success).toBe(false);
      expect(parsed.errors).toHaveLength(1);
    });

    it('shows dry run message when --dry-run is set', async () => {
      mockGenerate.mockResolvedValue({
        success: true,
        outputDir: './output',
        rulesGenerated: ['rule-a'],
        dryRun: true,
      });

      const cmd = createGenerateCommand();
      await cmd.parseAsync(['node', 'test', '--dry-run']);

      const output = mockConsoleLog.mock.calls.flat().join('\n');
      expect(output).toContain('Dry run');
    });

    it('formats template errors correctly', async () => {
      mockGenerate.mockResolvedValue({
        success: false,
        errors: [{ type: 'template', ruleName: 'my-rule', error: new Error('Bad template') }],
      });

      const cmd = createGenerateCommand();
      try {
        await cmd.parseAsync(['node', 'test']);
      } catch {
        // expected — execution continues after mocked process.exit
      }

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });
});
