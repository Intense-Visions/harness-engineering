import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  discoverCommands,
  classifyCommand,
  isNonCommandFile,
} from '../../src/cli-ergonomics-craft/extract/discover';

const LEAF = '.action(async () => {});';
const GROUP = '.addCommand(createFooCommand()).addCommand(createBarCommand());';

describe('discoverCommands', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-craft-discover-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content = LEAF): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('returns empty array when no command roots exist', () => {
    expect(discoverCommands(tmpDir)).toEqual([]);
  });

  it('discovers command definitions under a conventional root (src/commands)', () => {
    writeFile('src/commands/build.ts');
    writeFile('src/commands/deploy.ts');
    const cmds = discoverCommands(tmpDir);
    expect(cmds.map((c) => c.relative).sort()).toEqual([
      'src/commands/build.ts',
      'src/commands/deploy.ts',
    ]);
  });

  it('walks subdirectories recursively', () => {
    writeFile('src/commands/db/migrate.ts');
    writeFile('src/commands/db/seed.ts');
    const cmds = discoverCommands(tmpDir);
    expect(cmds.map((c) => c.relative).sort()).toEqual([
      'src/commands/db/migrate.ts',
      'src/commands/db/seed.ts',
    ]);
  });

  it('excludes tests, barrels (index/_registry), and type decls', () => {
    writeFile('src/commands/build.ts');
    writeFile('src/commands/build.test.ts');
    writeFile('src/commands/index.ts', GROUP);
    writeFile('src/commands/_registry.ts', GROUP);
    writeFile('src/commands/types.d.ts');
    const cmds = discoverCommands(tmpDir);
    expect(cmds.map((c) => c.relative)).toEqual(['src/commands/build.ts']);
  });

  it('excludes build/dep dirs (node_modules, dist, tests)', () => {
    writeFile('src/commands/real.ts');
    writeFile('src/commands/node_modules/pkg/cmd.ts');
    writeFile('src/commands/dist/cmd.ts');
    writeFile('src/commands/tests/helper.ts');
    const cmds = discoverCommands(tmpDir);
    expect(cmds.map((c) => c.relative)).toEqual(['src/commands/real.ts']);
  });

  it('honors an explicit commandsDir override', () => {
    writeFile('src/commands/ignored.ts');
    writeFile('tools/mycli/run.ts');
    const cmds = discoverCommands(tmpDir, { commandsDir: 'tools/mycli' });
    expect(cmds.map((c) => c.relative)).toEqual(['tools/mycli/run.ts']);
  });

  it('honors extraExcludeDirs', () => {
    writeFile('src/commands/keep.ts');
    writeFile('src/commands/legacy/old.ts');
    const cmds = discoverCommands(tmpDir, { extraExcludeDirs: ['legacy'] });
    expect(cmds.map((c) => c.relative)).toEqual(['src/commands/keep.ts']);
  });

  it('classifies discovered files by content (group vs leaf)', () => {
    writeFile('src/commands/leaf.ts', LEAF);
    writeFile('src/commands/group.ts', GROUP);
    const cmds = discoverCommands(tmpDir);
    const byName = new Map(cmds.map((c) => [path.basename(c.relative), c.kind]));
    expect(byName.get('leaf.ts')).toBe('leaf');
    expect(byName.get('group.ts')).toBe('group');
  });
});

describe('classifyCommand', () => {
  it('classifies a command with an action handler as a leaf', () => {
    expect(classifyCommand('build.ts', 'foo.action(() => {})')).toBe('leaf');
  });

  it('classifies a subcommand host with no own action as a group', () => {
    expect(classifyCommand('db.ts', 'g.addCommand(a).addCommand(b)')).toBe('group');
  });

  it('treats a command that both hosts subcommands and has its own action as a leaf', () => {
    expect(classifyCommand('x.ts', 'g.command("sub").action(() => {})')).toBe('leaf');
  });

  it('defaults to leaf when neither pattern is present', () => {
    expect(classifyCommand('plain.ts', 'export const x = 1;')).toBe('leaf');
  });
});

describe('isNonCommandFile', () => {
  it('flags tests, specs, decls, barrels, and underscore-prefixed files', () => {
    for (const f of [
      'src/commands/x.test.ts',
      'src/commands/x.spec.ts',
      'src/commands/x.d.ts',
      'src/commands/index.ts',
      'src/commands/_registry.ts',
    ]) {
      expect(isNonCommandFile(f)).toBe(true);
    }
  });

  it('does not flag an ordinary command file', () => {
    expect(isNonCommandFile('src/commands/deploy.ts')).toBe(false);
  });
});
