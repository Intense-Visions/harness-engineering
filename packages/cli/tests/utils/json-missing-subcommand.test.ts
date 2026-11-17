import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import {
  installJsonMissingSubcommand,
  missingSubcommandError,
} from '../../src/utils/json-missing-subcommand';

function makeProgram(): { program: Command; written: string[] } {
  const written: string[] = [];
  const program = new Command('harness').option('--json', 'Output as JSON').exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  const group = new Command('usage').exitOverride();
  group.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  group.command('daily').action(() => {});
  group.command('latest').action(() => {});
  group.command('secret', { hidden: true }).action(() => {});
  const nested = group.command('deep');
  nested.exitOverride();
  nested.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  nested.command('leaf').action(() => {});
  program.addCommand(group);
  installJsonMissingSubcommand(program, (s) => written.push(s));
  return { program, written };
}

async function parse(program: Command, args: string[]): Promise<number | undefined> {
  try {
    await program.parseAsync(args, { from: 'user' });
    return 0;
  } catch (e) {
    return (e as { exitCode?: number }).exitCode;
  }
}

describe('installJsonMissingSubcommand (#2673)', () => {
  it('writes a JSON error naming visible subcommands under --json, keeps exit 1', async () => {
    const { program, written } = makeProgram();
    const code = await parse(program, ['usage', '--json']);
    expect(code).toBe(1);
    const doc = JSON.parse(written.join('')) as {
      error: string;
      command: string;
      subcommands: string[];
    };
    expect(doc.command).toBe('usage');
    expect(doc.subcommands).toEqual(['daily', 'latest', 'deep']);
    expect(doc.error).toContain("Missing subcommand for 'harness usage'");
  });

  it('covers nested groups with the full command path', async () => {
    const { program, written } = makeProgram();
    await parse(program, ['usage', 'deep', '--json']);
    const doc = JSON.parse(written.join('')) as { command: string; subcommands: string[] };
    expect(doc.command).toBe('usage deep');
    expect(doc.subcommands).toEqual(['leaf']);
  });

  it('writes nothing without --json (commander help-on-stderr is unchanged)', async () => {
    const { program, written } = makeProgram();
    expect(await parse(program, ['usage'])).toBe(1);
    expect(written).toEqual([]);
  });

  it('writes nothing for a non-error help request', async () => {
    const { program, written } = makeProgram();
    await parse(program, ['usage', '--help', '--json']);
    expect(written).toEqual([]);
  });

  it('missingSubcommandError builds the document directly', () => {
    const root = new Command('harness');
    const g = root.command('adoption');
    g.command('skills');
    expect(missingSubcommandError(g)).toEqual({
      error: "Missing subcommand for 'harness adoption'. Available: skills",
      command: 'adoption',
      subcommands: ['skills'],
    });
  });
});
