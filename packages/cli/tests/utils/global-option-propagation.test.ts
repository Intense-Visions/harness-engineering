import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command, Option } from 'commander';
import { createProgram } from '../../src/index';

/**
 * #2069 — the root program declares `--json` / `--verbose` / `--quiet` /
 * `-c, --config`. Commander binds a repeated flag to the FIRST command that
 * declared it, so a subcommand that redeclares one of them and reads its own
 * `opts()` never saw the user's flag: `harness insights --json` printed pretty
 * text. These tests run the real command tree from createProgram().
 */

function findCommand(program: Command, path: readonly string[]): Command {
  let current = program;
  for (const segment of path) {
    const next = current.commands.find((c) => c.name() === segment);
    if (!next) throw new Error(`missing command: ${path.join(' ')}`);
    current = next;
  }
  return current;
}

/** Replace `path`'s action with one that captures its OWN opts() at action time. */
async function ownOptsAfterParse(
  path: readonly string[],
  argv: readonly string[]
): Promise<Record<string, unknown>> {
  const program = createProgram();
  program.exitOverride();
  const target = findCommand(program, path);
  let captured: Record<string, unknown> | undefined;
  target.action((...args: unknown[]) => {
    const cmd = args[args.length - 1] as Command;
    captured = cmd.opts();
  });
  await program.parseAsync([...argv], { from: 'user' });
  if (!captured) throw new Error(`action for ${path.join(' ')} never ran`);
  return captured;
}

describe('root option propagation into subcommands (#2069)', () => {
  // Representative set named in the issue, including nested subcommands.
  const cases: Array<{ path: string[]; extra?: string[] }> = [
    { path: ['insights'] },
    { path: ['telemetry', 'status'] },
    { path: ['maintenance', 'list'] },
    { path: ['mcp-guard', 'check'] },
    { path: ['routing', 'config'] },
    { path: ['advise-skills'], extra: ['--spec-path', 'x.md'] },
  ];

  it.each(cases)('honours `harness $path --json` in the subcommand opts', async (c) => {
    const opts = await ownOptsAfterParse(c.path, [...c.path, ...(c.extra ?? []), '--json']);
    expect(opts.json).toBe(true);
  });

  it.each(cases)('honours `harness --json $path` (flag before the subcommand)', async (c) => {
    const opts = await ownOptsAfterParse(c.path, ['--json', ...c.path, ...(c.extra ?? [])]);
    expect(opts.json).toBe(true);
  });

  it('leaves the subcommand default untouched when the flag is absent', async () => {
    const opts = await ownOptsAfterParse(['maintenance', 'list'], ['maintenance', 'list']);
    expect(opts.json).toBe(false);
  });

  it('propagates a value-taking root option (`linter validate -c <path>`)', async () => {
    const opts = await ownOptsAfterParse(
      ['linter', 'validate'],
      ['linter', 'validate', '-c', 'custom-linter.yml']
    );
    expect(opts.config).toBe('custom-linter.yml');
  });

  it('keeps the root program store populated (`harness --json <cmd>` still works)', async () => {
    const program = createProgram();
    program.exitOverride();
    findCommand(program, ['insights']).action(() => undefined);
    await program.parseAsync(['insights', '--json'], { from: 'user' });
    expect(program.opts().json).toBe(true);
  });

  describe('end to end: `harness maintenance list --json` emits JSON', () => {
    let dir: string | undefined;
    afterEach(() => {
      vi.restoreAllMocks();
      if (dir) rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    });

    it('prints a parseable JSON document instead of the pretty table', async () => {
      dir = mkdtempSync(join(tmpdir(), 'harness-2069-'));
      const lines: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        lines.push(a.map(String).join(' '));
      });
      vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__exit__');
      }) as never);
      const program = createProgram();
      program.exitOverride();
      await expect(
        program.parseAsync(['maintenance', 'list', '--json', '--path', dir], { from: 'user' })
      ).rejects.toThrow('__exit__');
      const parsed = JSON.parse(lines.join('\n')) as { tasks: unknown[] };
      expect(Array.isArray(parsed.tasks)).toBe(true);
      expect(parsed.tasks.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Guard: walk the WHOLE command tree. Every command that redeclares a root
 * option must see the user's value in its own opts() — so a future
 * `.option('--json')` read via bare `opts` can never be silently inert again.
 */
describe('guard: no command in the tree has a shadowed root option (#2069)', () => {
  type Site = { path: string[]; option: Option };

  function collectSites(): Site[] {
    const program = createProgram();
    const rootAttrs = new Set(
      program.options.filter((o) => o.attributeName() !== 'version').map((o) => o.attributeName())
    );
    const sites: Site[] = [];
    const walk = (cmd: Command, path: string[]): void => {
      for (const sub of cmd.commands) {
        const subPath = [...path, sub.name()];
        for (const option of sub.options) {
          if (rootAttrs.has(option.attributeName())) sites.push({ path: subPath, option });
        }
        walk(sub, subPath);
      }
    };
    walk(program, []);
    return sites;
  }

  const sites = collectSites();

  it('finds the redeclaration sites (denominator is non-empty)', () => {
    // 40+ `--json` sites exist today; a collapse to zero means the walk broke.
    expect(sites.filter((s) => s.option.attributeName() === 'json').length).toBeGreaterThan(30);
  });

  it.each(sites.map((s) => [`${s.path.join(' ')} ${s.option.long}`, s] as const))(
    '%s reaches the subcommand',
    async (_label, site) => {
      const program = createProgram();
      program.exitOverride();
      const target = findCommand(program, site.path);
      const args: string[] = [];
      for (const arg of target.registeredArguments) {
        if (arg.required) args.push(arg.argChoices?.[0] ?? 'x');
      }
      for (const opt of target.options) {
        if (opt.mandatory && opt !== site.option) args.push(opt.long!, opt.argChoices?.[0] ?? 'x');
      }
      const takesValue = site.option.required || site.option.optional;
      const flag = takesValue ? [site.option.long!, 'sentinel-value'] : [site.option.long!];
      let captured: Record<string, unknown> | undefined;
      target.action((...actionArgs: unknown[]) => {
        captured = (actionArgs[actionArgs.length - 1] as Command).opts();
      });
      await program.parseAsync([...site.path, ...args, ...flag], { from: 'user' });
      expect(captured?.[site.option.attributeName()]).toBe(takesValue ? 'sentinel-value' : true);
    }
  );
});
