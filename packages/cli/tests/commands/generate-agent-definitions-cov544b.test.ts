import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Command } from 'commander';
import {
  generateAgentDefinitions,
  createGenerateAgentDefinitionsCommand,
} from '../../src/commands/generate-agent-definitions';

/**
 * Branch coverage for generate-agent-definitions.ts: per-platform renderer +
 * filename selection (cursor/codex), the global output-dir resolution, the
 * printAgentDefsResult updated/removed/unchanged/dry-run branches, and the
 * invalid-platform throw path handled by handleError.
 */

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gad-cov544b-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateAgentDefinitions — per-platform renderers & filenames', () => {
  it('writes .md files for the cursor renderer', () => {
    const results = generateAgentDefinitions({
      platforms: ['cursor'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.platform).toBe('cursor');
    const files = fs.readdirSync(path.join(tmpDir, 'cursor'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.endsWith('.md'))).toBe(true);
  });

  it('writes .toml files for the codex renderer', () => {
    const results = generateAgentDefinitions({
      platforms: ['codex'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    expect(results[0]!.platform).toBe('codex');
    const files = fs.readdirSync(path.join(tmpDir, 'codex'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.endsWith('.toml'))).toBe(true);
  });

  it('resolves per-platform global output directories under the home dir', () => {
    // Exercise the global-output branch. dry-run: the plan is computed but no
    // file is ever written into the real home directory.
    const home = os.homedir();
    const platformSuffix: Record<string, string> = {
      'claude-code': path.join('.claude', 'agents'),
      'gemini-cli': path.join('.gemini', 'agents'),
      cursor: path.join('.cursor', 'agents'),
      codex: path.join('.codex', 'agents'),
    };
    for (const [platform, suffix] of Object.entries(platformSuffix)) {
      const results = generateAgentDefinitions({
        platforms: [platform as never],
        global: true,
        dryRun: true,
      });
      expect(results[0]!.outputDir).toBe(path.join(home, suffix));
    }
  });
});

describe('createGenerateAgentDefinitionsCommand — print branches', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  const EXIT = new Error('exit');

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw EXIT;
    }) as never);
  });

  function program(): Command {
    const p = new Command('harness').option('--json');
    p.addCommand(createGenerateAgentDefinitionsCommand());
    return p;
  }

  async function drive(args: string[]): Promise<void> {
    try {
      await program().parseAsync(args, { from: 'user' });
    } catch (e) {
      if (e !== EXIT) throw e;
    }
  }

  function joined(): string {
    return logSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
  }

  it('prints the added summary on a first (non-dry) run', async () => {
    await drive(['generate-agent-definitions', '--platforms', 'claude-code', '--output', tmpDir]);
    expect(joined()).toMatch(/\+ \d+ new:/);
  });

  it('prints updated + unchanged lines when a rendered file is stale, and removed for a stray', async () => {
    const outDir = path.join(tmpDir, 'claude-code');
    // First run creates the files.
    await drive(['generate-agent-definitions', '--platforms', 'claude-code', '--output', tmpDir]);
    const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(1);
    // Corrupt one file so it re-renders (updated); copy it to a stray name so
    // the plan marks the stray removed (it carries a generated header).
    const original = fs.readFileSync(path.join(outDir, files[0]!), 'utf-8');
    fs.writeFileSync(path.join(outDir, files[0]!), original + '\n<!-- drift -->\n');
    fs.writeFileSync(path.join(outDir, 'harness-zzz-stale.md'), original);

    logSpy.mockClear();
    await drive(['generate-agent-definitions', '--platforms', 'claude-code', '--output', tmpDir]);
    const out = joined();
    expect(out).toMatch(/~ \d+ updated:/);
    expect(out).toMatch(/= \d+ unchanged/);
    expect(out).toMatch(/- \d+ removed:.*harness-zzz-stale\.md/);
  });

  it('prints the dry-run notice and writes nothing', async () => {
    await drive([
      'generate-agent-definitions',
      '--platforms',
      'cursor',
      '--output',
      tmpDir,
      '--dry-run',
    ]);
    expect(joined()).toContain('(dry run — no files written)');
    expect(fs.existsSync(path.join(tmpDir, 'cursor'))).toBe(false);
  });

  it('routes an invalid platform through handleError (process.exit)', async () => {
    await drive([
      'generate-agent-definitions',
      '--platforms',
      'not-a-platform',
      '--output',
      tmpDir,
    ]);
    expect(exitSpy).toHaveBeenCalled();
  });
});
