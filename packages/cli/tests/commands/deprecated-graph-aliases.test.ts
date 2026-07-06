import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { registerDeprecatedGraphAliases } from '../../src/commands/graph/deprecated-aliases';

/**
 * Minimal program mirroring the real one's global options so the aliases'
 * preAction hook can read `--quiet` via optsWithGlobals().
 */
function buildProgram(): Command {
  const program = new Command();
  program.name('harness').option('--json').option('--quiet').exitOverride();
  registerDeprecatedGraphAliases(program);
  return program;
}

describe('deprecated graph aliases', () => {
  it('registers scan, query, and ingest as top-level commands', () => {
    const names = buildProgram()
      .commands.map((c) => c.name())
      .sort();
    expect(names).toEqual(['ingest', 'query', 'scan']);
  });

  it('hides the aliases from --help', () => {
    const program = buildProgram();
    const visible = program
      .createHelp()
      .visibleCommands(program)
      .map((c) => c.name());
    expect(visible).not.toContain('scan');
    expect(visible).not.toContain('query');
    expect(visible).not.toContain('ingest');
  });

  describe('runtime behavior', () => {
    let tmpDir: string;
    let stderrSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-alias-test-'));
      const srcDir = path.join(tmpDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'index.ts'), `export const x = 1;\n`);
      stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(async () => {
      stderrSpy.mockRestore();
      logSpy.mockRestore();
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('warns on stderr and delegates to the real scan implementation', async () => {
      await buildProgram().parseAsync(['scan', tmpDir], { from: 'user' });

      const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderr).toContain('"harness scan" is deprecated');
      expect(stderr).toContain('harness graph scan');
      // Delegation actually ran the scan and built the graph.
      const graphDir = path.join(tmpDir, '.harness', 'graph');
      await expect(fs.stat(graphDir)).resolves.toBeDefined();
    });

    it('suppresses the deprecation notice under --quiet', async () => {
      await buildProgram().parseAsync(['--quiet', 'scan', tmpDir], { from: 'user' });

      const stderr = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderr).not.toContain('deprecated');
    });
  });
});
