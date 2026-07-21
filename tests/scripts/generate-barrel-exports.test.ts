/**
 * Behavior lock for scripts/generate-barrel-exports.mjs — the build script that
 * scans packages/cli/src/commands for `createXXXCommand` exports and generates
 * (or, under --check, verifies the freshness of) the _registry.ts CLI command
 * registry consumed by createProgram().
 *
 * The script exports nothing and runs its whole flow at module top-level against
 * the real filesystem, so these tests mock node:fs with an in-memory tree,
 * control process.argv, and re-execute the module via vi.resetModules() + a
 * dynamic import. That keeps the test hermetic (no real IO, no subprocess, no
 * timers) while asserting the observable contract: what gets written and what
 * the --check gate reports.
 *
 * Fixture tree under commands/ deliberately exercises every discovery rule:
 *   alpha.ts        -> `export function createAlphaCommand(`   (included)
 *   beta.ts         -> `export const createBetaCommand =`      (included)
 *   nested/index.ts -> directory scanned via its index.ts      (included)
 *   dup/index.ts    -> re-exports createAlphaCommand + own     (dedup + include)
 *   _registry.ts    -> leading underscore                      (skipped)
 *   _helpers.ts     -> leading underscore                      (skipped)
 *   widget.test.ts  -> .test.ts                                (skipped)
 *   shims.d.ts      -> .d.ts                                   (skipped)
 *   README.md       -> non-.ts                                 (skipped)
 *   empty/          -> directory without index.ts              (skipped)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Absolute paths the SUT computes from its own module location. The script lives
// at <repo>/scripts and derives ROOT via resolve(import.meta.dirname, '..'); this
// test lives at <repo>/tests/scripts, so resolve('..','..') lands on the same
// repo root and our mock keys match the paths the script queries.
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '..', '..');
const COMMANDS_DIR = join(REPO_ROOT, 'packages', 'cli', 'src', 'commands');
const REGISTRY_PATH = join(COMMANDS_DIR, '_registry.ts');
const SUT = '../../scripts/generate-barrel-exports.mjs';

const HEADER =
  '// AUTO-GENERATED — do not edit. Run `pnpm run generate-barrel-exports` to regenerate.\n';

// The command creators the fixture tree should yield, alphabetically sorted and
// deduplicated (createAlphaCommand appears in both alpha.ts and dup/index.ts).
const EXPECTED_COMMAND_NAMES = [
  'createAlphaCommand',
  'createBetaCommand',
  'createDupCommand',
  'createNestedCommand',
];

// Names that live in the tree but must be excluded by the discovery rules.
const SKIPPED_COMMAND_NAMES = [
  'createShouldSkipCommand', // _helpers.ts (leading underscore)
  'createWidgetCommand', // widget.test.ts (.test.ts)
  'createShimCommand', // shims.d.ts (.d.ts)
  'createNopeCommand', // README.md (non-.ts)
];

// The exact registry the fixture tree must serialize to. This is the observable
// contract: header, `commander` type import, alphabetically-sorted imports (first
// occurrence wins for dups -> createAlphaCommand resolves to './alpha', not
// './dup'), the doc block, and the sorted registration array.
const EXPECTED_REGISTRY =
  HEADER +
  '\n' +
  "import type { Command } from 'commander';\n" +
  '\n' +
  "import { createAlphaCommand } from './alpha';\n" +
  "import { createBetaCommand } from './beta';\n" +
  "import { createDupCommand } from './dup';\n" +
  "import { createNestedCommand } from './nested';\n" +
  '\n' +
  '/**\n' +
  ' * All discovered command creators, sorted alphabetically.\n' +
  ' * Used by createProgram() to register commands without manual imports.\n' +
  ' */\n' +
  'export const commandCreators: Array<() => Command> = [\n' +
  '  createAlphaCommand,\n' +
  '  createBetaCommand,\n' +
  '  createDupCommand,\n' +
  '  createNestedCommand,\n' +
  '];\n';

// Hoisted virtual filesystem shared with the node:fs mock factory below.
const fsState = vi.hoisted(() => ({
  files: new Map<string, { type: 'file' | 'dir'; content?: string; entries?: string[] }>(),
  writes: [] as Array<{ path: string; content: string }>,
}));

vi.mock('node:fs', () => {
  const enoent = (p: string) => Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
  return {
    readFileSync: (p: string) => {
      const node = fsState.files.get(p);
      if (!node || node.type !== 'file') throw enoent(p);
      return node.content;
    },
    writeFileSync: (p: string, content: string) => {
      fsState.writes.push({ path: p, content });
      fsState.files.set(p, { type: 'file', content });
    },
    readdirSync: (p: string) => {
      const node = fsState.files.get(p);
      if (!node || node.type !== 'dir') throw enoent(p);
      return (node.entries ?? []).slice();
    },
    statSync: (p: string) => {
      const node = fsState.files.get(p);
      if (!node) throw enoent(p);
      return { isDirectory: () => node.type === 'dir' };
    },
    existsSync: (p: string) => fsState.files.has(p),
  };
});

class ProcessExitError extends Error {
  constructor(public code?: number) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExitError';
  }
}

function dir(path: string, entries: string[]): void {
  fsState.files.set(path, { type: 'dir', entries });
}
function file(path: string, content: string): void {
  fsState.files.set(path, { type: 'file', content });
}

/**
 * Populate the virtual commands/ tree. Pass a `registry` string to also seed the
 * generated _registry.ts (used by --check tests); omit it to simulate a missing
 * registry.
 */
function seedTree(options: { registry?: string } = {}): void {
  fsState.files.clear();
  fsState.writes.length = 0;

  dir(COMMANDS_DIR, [
    'alpha.ts',
    'beta.ts',
    '_registry.ts',
    '_helpers.ts',
    'widget.test.ts',
    'shims.d.ts',
    'README.md',
    'nested',
    'empty',
    'dup',
  ]);

  file(join(COMMANDS_DIR, 'alpha.ts'), 'export function createAlphaCommand() { return {}; }');
  file(join(COMMANDS_DIR, 'beta.ts'), 'export const createBetaCommand = () => ({});');
  file(join(COMMANDS_DIR, '_helpers.ts'), 'export function createShouldSkipCommand() {}');
  file(join(COMMANDS_DIR, 'widget.test.ts'), 'export function createWidgetCommand() {}');
  file(join(COMMANDS_DIR, 'shims.d.ts'), 'export const createShimCommand = () => {};');
  file(join(COMMANDS_DIR, 'README.md'), '# docs mentioning createNopeCommand in prose');

  dir(join(COMMANDS_DIR, 'nested'), ['index.ts']);
  file(join(COMMANDS_DIR, 'nested', 'index.ts'), 'export function createNestedCommand() {}');

  // Directory without an index.ts must be skipped entirely.
  dir(join(COMMANDS_DIR, 'empty'), ['orphan.ts']);

  // dup/index.ts re-exports createAlphaCommand (dedup: first-seen alpha.ts wins)
  // and contributes its own createDupCommand.
  dir(join(COMMANDS_DIR, 'dup'), ['index.ts']);
  file(
    join(COMMANDS_DIR, 'dup', 'index.ts'),
    'export const createAlphaCommand = () => {};\nexport function createDupCommand() {}'
  );

  if (options.registry !== undefined) {
    file(REGISTRY_PATH, options.registry);
  }
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let originalArgv: string[];

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitError(code);
  }) as never);
  originalArgv = process.argv;
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  fsState.files.clear();
  fsState.writes.length = 0;
});

/** Re-execute the top-level script body under the current fs state + argv. */
async function runScript(argv: string[]): Promise<void> {
  process.argv = argv;
  vi.resetModules();
  await import(SUT);
}

describe('generate-barrel-exports (generate mode)', () => {
  it('writes the sorted, deduplicated registry to _registry.ts', async () => {
    seedTree();

    await runScript(['node', 'generate-barrel-exports.mjs']);

    expect(fsState.writes).toHaveLength(1);
    expect(fsState.writes[0].path).toBe(REGISTRY_PATH);
    expect(fsState.writes[0].content).toBe(EXPECTED_REGISTRY);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`with ${EXPECTED_COMMAND_NAMES.length} commands`)
    );
  });

  it('excludes underscored, .test.ts, .d.ts, non-.ts, and index-less directory files', async () => {
    seedTree();

    await runScript(['node', 'generate-barrel-exports.mjs']);

    const { content } = fsState.writes[0];
    for (const name of SKIPPED_COMMAND_NAMES) {
      expect(content).not.toContain(name);
    }
    for (const name of EXPECTED_COMMAND_NAMES) {
      expect(content).toContain(name);
    }
  });

  it('deduplicates a re-exported creator, keeping the first-seen import path', async () => {
    seedTree();

    await runScript(['node', 'generate-barrel-exports.mjs']);

    const { content } = fsState.writes[0];
    const alphaImports = content.match(/import \{ createAlphaCommand \} from/g) ?? [];
    expect(alphaImports).toHaveLength(1);
    expect(content).toContain("import { createAlphaCommand } from './alpha';");
    expect(content).not.toContain("import { createAlphaCommand } from './dup';");
  });
});

describe('generate-barrel-exports (--check mode)', () => {
  it('reports the registry is up to date when it matches, without writing', async () => {
    seedTree({ registry: EXPECTED_REGISTRY });

    await runScript(['node', 'generate-barrel-exports.mjs', '--check']);

    expect(fsState.writes).toHaveLength(0);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('up to date'));
  });

  it('exits 1 and reports staleness when the on-disk registry differs', async () => {
    seedTree({ registry: HEADER + '\n// stale contents that no longer match\n' });

    await expect(
      runScript(['node', 'generate-barrel-exports.mjs', '--check'])
    ).rejects.toBeInstanceOf(ProcessExitError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fsState.writes).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('stale'));
  });

  it('exits 1 and reports absence when the registry file is missing', async () => {
    seedTree(); // no registry seeded

    await expect(
      runScript(['node', 'generate-barrel-exports.mjs', '--check'])
    ).rejects.toBeInstanceOf(ProcessExitError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fsState.writes).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
});
