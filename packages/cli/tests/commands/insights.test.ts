// packages/cli/tests/commands/insights.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createInsightsCommand } from '../../src/commands/insights';

async function runCommand(cwd: string, args: string[]): Promise<void> {
  const parent = new Command();
  parent.addCommand(createInsightsCommand());
  parent.exitOverride();
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  try {
    await parent.parseAsync(['node', 'test', 'insights', ...args]);
  } finally {
    cwdSpy.mockRestore();
  }
}

describe('insights command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let tmp: string;

  beforeEach(() => {
    vi.clearAllMocks();
    logOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    });
    tmp = mkdtempSync(join(tmpdir(), 'harness-insights-cli-'));
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('createInsightsCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createInsightsCommand();
      expect(cmd.name()).toBe('insights');
    });

    it('has description mentioning composite report', () => {
      const cmd = createInsightsCommand();
      expect(cmd.description().toLowerCase()).toContain('composite');
    });

    it('exposes --json and --skip options', () => {
      const cmd = createInsightsCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--json');
      expect(opts).toContain('--skip');
    });
  });

  describe('execution', () => {
    it('emits a composite JSON report when --json is set', async () => {
      await runCommand(tmp, ['--json']);
      const parsed = JSON.parse(logOutput.join('\n').trim()) as Record<string, unknown>;
      for (const key of ['health', 'entropy', 'decay', 'attention', 'impact']) {
        expect(parsed).toHaveProperty(key);
      }
      expect(parsed).toHaveProperty('warnings');
      expect(parsed).toHaveProperty('generatedAt');
    });

    it('honours --skip with valid keys (skipped sections are null)', async () => {
      await runCommand(tmp, ['--json', '--skip', 'entropy,health']);
      const parsed = JSON.parse(logOutput.join('\n').trim()) as Record<string, unknown>;
      expect(parsed.entropy).toBeNull();
      expect(parsed.health).toBeNull();
    });

    it('silently drops unknown --skip keys without erroring', async () => {
      await runCommand(tmp, ['--json', '--skip', 'not-a-key,impact']);
      const parsed = JSON.parse(logOutput.join('\n').trim()) as Record<string, unknown>;
      expect(parsed.impact).toBeNull();
      // Other sections still run.
      expect(parsed.entropy).not.toBeNull();
    });

    it('renders a pretty text report (default mode)', async () => {
      await runCommand(tmp, []);
      const all = logOutput.join('\n');
      expect(all).toMatch(/Insights for/);
      expect(all).toMatch(/Generated:/);
    });
  });
});
