// packages/cli/tests/commands/insights.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
    // A project entropy can actually analyse: an entry point plus one dead file,
    // so a measured report is visibly different from a not-measured one.
    mkdirSync(join(tmp, 'src'));
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'fx', main: 'src/index.ts' }));
    writeFileSync(join(tmp, 'src', 'index.ts'), 'export const main = 1;\n');
    writeFileSync(join(tmp, 'src', 'orphan.ts'), 'export const orphan = 2;\n');
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
      expect(all).toMatch(/Health {6}: FAIL/);
      expect(all).toMatch(/1 dead files/);
    });

    it('reports a failed entropy analysis as NOT MEASURED, never PASS (#2267)', async () => {
      // No entry point (no manifest, no src/index.ts): the entropy analyzer
      // fails. Before this fix the failure
      // became zero counts and the health block read PASS.
      rmSync(join(tmp, 'package.json'));
      rmSync(join(tmp, 'src'), { recursive: true });
      await runCommand(tmp, []);
      const all = logOutput.join('\n');
      expect(all).not.toMatch(/PASS/);
      expect(all).toMatch(/Health {6}: NOT MEASURED \(see warnings\)/);
      expect(all).toMatch(/Entropy {5}: NOT MEASURED \(see warnings\)/);
      expect(all).toMatch(/- health: entropy analysis failed \(ENTRY_POINT_NOT_FOUND\)/);
    });

    it('a block skipped via --skip stays omitted, even when entropy would fail', async () => {
      // Same failing project as above, so a renderer that printed NOT MEASURED
      // for every null block (rather than only for a block that FAILED) would
      // show it here.
      rmSync(join(tmp, 'package.json'));
      rmSync(join(tmp, 'src'), { recursive: true });
      await runCommand(tmp, ['--skip', 'entropy,health']);
      const all = logOutput.join('\n');
      expect(all).toMatch(/Insights for/);
      expect(all).not.toMatch(/NOT MEASURED/);
      expect(all).not.toMatch(/^Health/m);
      expect(all).not.toMatch(/^Entropy/m);
    });

    it('JSON: a failed entropy analysis yields null blocks plus warnings (#2267)', async () => {
      rmSync(join(tmp, 'package.json'));
      rmSync(join(tmp, 'src'), { recursive: true });
      await runCommand(tmp, ['--json']);
      const parsed = JSON.parse(logOutput.join('\n').trim()) as {
        health: unknown;
        entropy: unknown;
        warnings: string[];
      };
      expect(parsed.health).toBeNull();
      expect(parsed.entropy).toBeNull();
      expect(parsed.warnings).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^health: entropy analysis failed \(ENTRY_POINT_NOT_FOUND\)/),
          expect.stringMatching(/^entropy: entropy analysis failed \(ENTRY_POINT_NOT_FOUND\)/),
        ])
      );
    });
  });
});
