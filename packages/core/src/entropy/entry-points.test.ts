import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveEntryPoints } from './entry-points';

/**
 * Unit coverage for `resolveEntryPoints` — the multi-language entry-point
 * resolver that seeds dead-code / drift analysis. Runs against a real temp
 * directory tree (the resolver reads manifests and probes conventional files
 * on disk).
 *
 * Behaviour pinned here:
 *  - explicit entries short-circuit and are resolved absolute;
 *  - TypeScript package.json `exports`/`main`/`bin` and conventional files;
 *  - the TS-first priority on a polyglot repo;
 *  - Python detection + conventional files;
 *  - the tailored ENTRY_POINT_NOT_FOUND error when nothing resolves.
 */

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-points-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, contents = ''): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

describe('resolveEntryPoints — explicit entries', () => {
  it('short-circuits and resolves explicit entries to absolute paths', async () => {
    const res = await resolveEntryPoints(root, ['src/a.ts', 'src/b.ts']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.resolve(root, 'src/a.ts'), path.resolve(root, 'src/b.ts')]);
  });

  it('ignores explicit entries when the array is empty and falls through to detection', async () => {
    write('src/index.ts');
    write('package.json', '{}');
    const res = await resolveEntryPoints(root, []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.join(root, 'src/index.ts')]);
  });
});

describe('resolveEntryPoints — TypeScript', () => {
  it('resolves the package.json `main` field', async () => {
    write('package.json', JSON.stringify({ main: 'dist/index.js' }));
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.resolve(root, 'dist/index.js')]);
  });

  it('resolves string `exports` and prefers it over `main`', async () => {
    write('package.json', JSON.stringify({ exports: './src/entry.ts', main: 'dist/index.js' }));
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.resolve(root, './src/entry.ts')]);
  });

  it('falls back to a conventional src/index.ts when package.json declares no entry', async () => {
    write('package.json', '{}');
    write('src/index.ts');
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.join(root, 'src/index.ts')]);
  });

  it('collects bin entries from an object bin map', async () => {
    write('package.json', JSON.stringify({ bin: { foo: 'bin/foo.js', bar: 'bin/bar.js' } }));
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.resolve(root, 'bin/foo.js'), path.resolve(root, 'bin/bar.js')]);
  });
});

describe('resolveEntryPoints — priority & Python', () => {
  it('prefers TypeScript over Python on a polyglot repo', async () => {
    write('package.json', JSON.stringify({ main: 'index.ts' }));
    write('pyproject.toml', '[project]\nname = "thing"\n');
    write('main.py');
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.resolve(root, 'index.ts')]);
  });

  it('resolves a conventional Python entry when a manifest is present', async () => {
    write('pyproject.toml', '[tool.other]\nx = 1\n');
    write('main.py');
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.join(root, 'main.py')]);
  });
});

describe('resolveEntryPoints — no entry points', () => {
  it('returns a tailored ENTRY_POINT_NOT_FOUND error naming detected languages', async () => {
    write('package.json', '{}'); // TS detected, but no entries anywhere
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('ENTRY_POINT_NOT_FOUND');
    expect(res.error.details.reason).toContain('typescript');
    expect(res.error.suggestions).toContain('Specify entryPoints in config');
  });

  it('returns the generic (no-manifest) reason when nothing at all is present', async () => {
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('ENTRY_POINT_NOT_FOUND');
    expect(res.error.details.reason).toContain('No language manifest');
  });
});
