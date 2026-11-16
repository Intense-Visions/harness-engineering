import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildSnapshot } from '../../src/entropy/snapshot';
import { detectDeadCode } from '../../src/entropy/detectors/dead-code';
import type { EntropyConfig } from '../../src/entropy/types';

/**
 * #2296: an entry point that EXISTS on disk but is never analysed is as dead a
 * reachability root as one that matches no file (#2275). It passes the
 * existence check, is enqueued as a BFS root, matches nothing in
 * `snapshot.files`, and contributes no reachability — so everything only it
 * reaches reports dead while the run raises no error.
 *
 * Three ways a real file falls out of the analysed set: an exclude pattern, an
 * extension outside `include`, and a directory `findFiles` ignores
 * unconditionally (`dist` for a package.json `main`). Each must fail the
 * dead-code run with the entry NAMED, never report a clean or noisy result.
 */

let root: string;

const write = (rel: string, contents: string): void => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-points-unanalysed-'));
  write('package.json', JSON.stringify({ name: 'unanalysed-fixture' }));
  write(
    'src/index.ts',
    "import { helper } from './helper';\nexport const main = () => helper();\n"
  );
  write('src/helper.ts', "export function helper(): string {\n  return 'ok';\n}\n");
  write(
    'src/cli/main.ts',
    "import { helper } from '../helper';\nexport const run = () => helper();\n"
  );
  write('src/tool.mjs', 'export const tool = 1;\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const snapshotFor = (overrides: Partial<EntropyConfig>) =>
  buildSnapshot({ rootDir: root, analyze: { deadCode: true }, ...overrides });

describe('entry points that exist but are never analysed (#2296)', () => {
  it('fails a dead-code run on a configured entry point hidden by an exclude pattern', async () => {
    const snapshot = await snapshotFor({
      entryPoints: ['src/index.ts', 'src/cli/main.ts'],
      exclude: ['**/node_modules/**', 'src/cli/**'],
    });

    expect(snapshot.ok).toBe(false);
    if (snapshot.ok) return;
    expect(snapshot.error.code).toBe('ENTRY_POINT_NOT_ANALYSED');
    // The string the author wrote, not its absolute form.
    expect(snapshot.error.details.issues).toEqual(['src/cli/main.ts']);
    expect(snapshot.error.message).toContain('src/cli/main.ts');
  });

  it('fails a dead-code run on a configured entry point outside the include patterns', async () => {
    const snapshot = await snapshotFor({
      entryPoints: ['src/index.ts', 'src/tool.mjs'],
      include: ['src/**/*.ts'],
    });

    expect(snapshot.ok).toBe(false);
    if (snapshot.ok) return;
    expect(snapshot.error.code).toBe('ENTRY_POINT_NOT_ANALYSED');
    expect(snapshot.error.details.issues).toEqual(['src/tool.mjs']);
  });

  it('fails a dead-code run when an auto-detected package.json main is a skipped build artifact', async () => {
    // The adopter shape from the issue: `main` names a BUILT file, which exists
    // after a build and so passes #2275's existence check, but `dist` is in the
    // walker's unconditional ignore list.
    write('package.json', JSON.stringify({ name: 'built', main: 'dist/index.js' }));
    write('dist/index.js', "export const main = () => 'ok';\n");

    const snapshot = await snapshotFor({});

    expect(snapshot.ok).toBe(false);
    if (snapshot.ok) return;
    expect(snapshot.error.code).toBe('ENTRY_POINT_NOT_ANALYSED');
    expect(snapshot.error.details.issues).toEqual(['dist/index.js']);
  });

  it('keeps a run that reads no entry points going, carrying the error for its caller', async () => {
    const snapshot = await snapshotFor({
      analyze: { complexity: true },
      entryPoints: ['src/index.ts', 'src/cli/main.ts'],
      exclude: ['**/node_modules/**', 'src/cli/**'],
    });

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value.entryPointsError?.code).toBe('ENTRY_POINT_NOT_ANALYSED');
    expect(snapshot.value.entryPointsError?.details.issues).toEqual(['src/cli/main.ts']);
  });

  it('accepts a configured entry point under a skip-dir it waives (#2524 control)', async () => {
    write(
      'src/bin/cli.ts',
      "import { helper } from '../helper';\nexport const cli = () => helper();\n"
    );

    const snapshot = await snapshotFor({
      entryPoints: ['src/index.ts', 'src/bin/cli.ts'],
      exclude: ['**/node_modules/**', '**/bin/**'],
    });

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value.entryPointsError).toBeUndefined();
    const dead = await detectDeadCode(snapshot.value);
    expect(dead.ok).toBe(true);
    if (!dead.ok) return;
    const names = dead.value.deadExports.map((e) => e.name);
    expect(names).not.toContain('helper');
    expect(names).not.toContain('cli');
  });

  it('accepts entry points that are all analysed (negative control)', async () => {
    const snapshot = await snapshotFor({ entryPoints: ['src/index.ts', 'src/cli/main.ts'] });

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value.entryPointsError).toBeUndefined();
  });
});
