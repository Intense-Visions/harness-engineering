import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { createProgram } from '../../src/index';
import {
  GUARDED_COMMANDS,
  installVersionGuard,
  resolveCommandPath,
} from '../../src/utils/version-guard';
import { _resolveCommandName } from '../../src/bin/command-telemetry';

describe('resolveCommandPath', () => {
  function build(): Command {
    const program = new Command();
    program.name('harness');
    const graph = program.command('graph');
    graph.command('scan');
    program.command('validate');
    return program;
  }

  function find(program: Command, path: string[]): Command {
    let current: Command = program;
    for (const segment of path) {
      const next = current.commands.find((c) => c.name() === segment);
      if (!next) throw new Error(`missing command ${segment}`);
      current = next;
    }
    return current;
  }

  // Criterion 7a. The `cli/` prefix is telemetry's namespace. If the guard
  // inherited it, GUARDED_COMMANDS.has() would always be false and the guard
  // would be a permanently silent no-op — this change reproducing its own bug.
  it('returns an unprefixed path for a top-level command', () => {
    expect(resolveCommandPath(find(build(), ['validate']))).toBe('validate');
  });

  it('returns an unprefixed dotted path for a nested command', () => {
    expect(resolveCommandPath(find(build(), ['graph', 'scan']))).toBe('graph.scan');
  });

  // Pins the intentional divergence: telemetry keeps its own namespace, and if
  // someone later unifies the two helpers this test says which output is whose.
  it('diverges from telemetry, which still emits cli/-prefixed names', () => {
    const validate = find(build(), ['validate']);
    expect(resolveCommandPath(validate)).toBe('validate');
    expect(_resolveCommandName(validate)).toBe('cli/validate');

    const scan = find(build(), ['graph', 'scan']);
    expect(resolveCommandPath(scan)).toBe('graph.scan');
    expect(_resolveCommandName(scan)).toBe('cli/graph.scan');
  });

  it('returns an empty string for the root program', () => {
    expect(resolveCommandPath(build())).toBe('');
  });
});

describe('GUARDED_COMMANDS against the real program', () => {
  const program = createProgram();
  const topLevel = new Set(program.commands.map((c) => c.name()));

  // Criterion 7: keeps the set from silently rotting as commands are renamed.
  it.each([...GUARDED_COMMANDS])('%s is a registered top-level command', (name) => {
    expect(topLevel.has(name)).toBe(true);
  });

  // Criterion 6: the remedy commands must remain reachable.
  it.each(['doctor', 'update'])('%s exists and is not gated', (name) => {
    expect(topLevel.has(name)).toBe(true);
    expect(GUARDED_COMMANDS.has(name)).toBe(false);
  });

  // The membership test above only catches renames. This catches OMISSIONS:
  // every command emitting the machine-readable findings contract must be
  // gated, so adding a new one without gating it fails here rather than
  // silently shipping an ungated findings producer.
  it('gates every command that emits the --findings-json contract', () => {
    const emitters = readdirSync(join(__dirname, '..', '..', 'src', 'commands'))
      .filter((f) => f.endsWith('.ts'))
      .filter((f) =>
        readFileSync(join(__dirname, '..', '..', 'src', 'commands', f), 'utf-8').includes(
          'findings-json'
        )
      )
      .map((f) => f.replace(/\.ts$/, ''));

    expect(emitters.length).toBeGreaterThan(0);
    for (const name of emitters) {
      expect(
        GUARDED_COMMANDS.has(name),
        `${name} emits --findings-json but is not in GUARDED_COMMANDS`
      ).toBe(true);
    }
  });
});

describe('installVersionGuard', () => {
  it('is a no-op when the program has no hook method (test environments)', () => {
    const fake = { hook: undefined } as unknown as Command;
    expect(() => installVersionGuard(fake, process.cwd())).not.toThrow();
  });

  it('registers a preAction hook when one is available', () => {
    const calls: string[] = [];
    const fake = {
      hook: (event: string) => {
        calls.push(event);
        return fake;
      },
    } as unknown as Command;
    installVersionGuard(fake, process.cwd());
    expect(calls).toEqual(['preAction']);
  });
});

/**
 * End-to-end enforcement.
 *
 * Asserting only that `.hook('preAction')` was called proves nothing — those
 * assertions pass with an empty hook body. These drive a real commander program
 * so that a regression to a silently-inert guard fails CI.
 *
 * CLI_VERSION is mocked to 1.13.1, the version from the incident this guards
 * against, so the fixtures describe the real failure.
 */
vi.mock('../../src/version', () => ({ CLI_VERSION: '1.13.1' }));

describe('installVersionGuard — enforcement', () => {
  let root: string;
  let exitSpy: MockInstance;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'guard-enforce-'));
    writeFileSync(
      join(root, 'harness.config.json'),
      JSON.stringify({ version: 1, toolchain: { cliVersion: '>=11' } })
    );
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('PROCESS_EXIT');
    }) as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function program(commandName: string, action: () => void, cwd = root): Command {
    const p = new Command();
    p.name('harness').option('-c, --config <path>');
    p.command(commandName).action(action);
    installVersionGuard(p, cwd);
    return p;
  }

  const stderrText = (): string => stderrSpy.mock.calls.map((c) => String(c[0])).join('');

  it('refuses a guarded command, exits 3, and never runs the action', async () => {
    const ran = vi.fn();
    await expect(
      program('validate', ran).parseAsync(['validate'], { from: 'user' })
    ).rejects.toThrow('PROCESS_EXIT');

    expect(exitSpy).toHaveBeenCalledWith(3);
    expect(ran).not.toHaveBeenCalled();
    expect(stderrText()).toContain('refusing to run');
    expect(stderrText()).toContain('1.13.1');
  });

  it('lets an unguarded command run at the same mismatch', async () => {
    const ran = vi.fn();
    await program('doctor', ran).parseAsync(['doctor'], { from: 'user' });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledOnce();
    expect(stderrText()).toBe('');
  });

  it('warns but still runs when only one major behind', async () => {
    writeFileSync(
      join(root, 'harness.config.json'),
      JSON.stringify({ version: 1, toolchain: { cliVersion: '>=2' } })
    );
    const ran = vi.fn();
    await program('validate', ran).parseAsync(['validate'], { from: 'user' });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledOnce();
    expect(stderrText()).toContain('version mismatch');
  });

  it('stays silent when the workspace declares nothing', async () => {
    rmSync(join(root, 'harness.config.json'));
    const ran = vi.fn();
    await program('validate', ran, root).parseAsync(['validate'], { from: 'user' });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledOnce();
    expect(stderrText()).toBe('');
  });

  it('downgrades to a warning under HARNESS_NO_VERSION_GUARD but still runs', async () => {
    vi.stubEnv('HARNESS_NO_VERSION_GUARD', '1');
    const ran = vi.fn();
    await program('validate', ran).parseAsync(['validate'], { from: 'user' });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledOnce();
    expect(stderrText()).toContain('1.13.1');
    vi.unstubAllEnvs();
  });

  // Regression guard for the relative `-c` bug: resolving the override against
  // the walked-up project root rather than the cwd made the guard read a
  // different file than the command, fall through to `unknown`, and silently
  // stop enforcing — so passing `-c` *disabled* the guard.
  it('resolves a relative -c path against the cwd, not the project root', async () => {
    const sub = join(root, 'packages', 'cli');
    mkdirSync(sub, { recursive: true });
    writeFileSync(
      join(sub, 'ci.harness.config.json'),
      JSON.stringify({ version: 1, toolchain: { cliVersion: '>=11' } })
    );
    const ran = vi.fn();
    await expect(
      program('validate', ran, sub).parseAsync(['validate', '-c', './ci.harness.config.json'], {
        from: 'user',
      })
    ).rejects.toThrow('PROCESS_EXIT');

    expect(exitSpy).toHaveBeenCalledWith(3);
    expect(ran).not.toHaveBeenCalled();
  });

  it('never lets a malformed config break the command', async () => {
    writeFileSync(join(root, 'harness.config.json'), '{ not json');
    const ran = vi.fn();
    await program('validate', ran).parseAsync(['validate'], { from: 'user' });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(ran).toHaveBeenCalledOnce();
  });
});
