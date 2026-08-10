import { describe, it, expect } from 'vitest';
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
