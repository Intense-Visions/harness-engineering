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
 *  - the tailored ENTRY_POINT_NOT_FOUND error when nothing resolves;
 *  - configured entries that match no file are reported by name (#2275).
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
    write('src/a.ts');
    write('src/b.ts');
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
    write('dist/index.js');
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.resolve(root, 'dist/index.js')]);
  });

  it('resolves string `exports` and prefers it over `main`', async () => {
    write('package.json', JSON.stringify({ exports: './src/entry.ts', main: 'dist/index.js' }));
    write('src/entry.ts');
    write('dist/index.js');
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.join(root, 'src', 'entry.ts')]);
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
    write('bin/foo.js');
    write('bin/bar.js');
    const res = await resolveEntryPoints(root);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.resolve(root, 'bin/foo.js'), path.resolve(root, 'bin/bar.js')]);
  });
});

describe('resolveEntryPoints — priority & Python', () => {
  it('prefers TypeScript over Python on a polyglot repo', async () => {
    write('package.json', JSON.stringify({ main: 'index.ts' }));
    write('index.ts');
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

/**
 * #2275. A configured entry point that matches no file used to flow through as a
 * literal path: the dead-code BFS then started from a root that is in no file
 * set, so nothing was reachable, every export looked dead, and the gate still
 * reported a clean result over an analysis of nothing.
 *
 * Each case below asserts the NAMED unresolvable entry, not merely that the call
 * failed: the string the author wrote is the entire deliverable of the
 * diagnostic, and `ok === false` alone would also be satisfied by a resolver
 * that rejected every configuration.
 */
describe('resolveEntryPoints — configured entries that match no file (#2275)', () => {
  it('rejects a glob and says the field is not glob-expanded', async () => {
    // A real file is on disk that the glob WOULD have matched, so the failure
    // cannot be read as "the project has no source".
    write('src/index.ts');
    const res = await resolveEntryPoints(root, ['src/**/*.ts']);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('ENTRY_POINT_NOT_FOUND');
    expect(res.error.details.issues).toEqual(['src/**/*.ts']);
    expect(res.error.message).toBe('1 of 1 configured entryPoints match no file: src/**/*.ts');
    expect(res.error.suggestions.join('\n')).toContain(
      'entryPoints are literal file paths, never glob patterns'
    );
    expect(res.error.suggestions.join('\n')).toContain('src/**/*.ts');
  });

  it('names only the unresolvable entry when the rest of the config is good', async () => {
    write('src/index.ts');
    write('src/cli.ts');
    const res = await resolveEntryPoints(root, ['src/index.ts', 'src/typpo.ts', 'src/cli.ts']);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Exactly the typo — not the two that resolved, and not a bare count.
    expect(res.error.details.issues).toEqual(['src/typpo.ts']);
    expect(res.error.message).toBe('1 of 3 configured entryPoints match no file: src/typpo.ts');
    expect(res.error.details.reason).toContain('src/typpo.ts');
    expect(res.error.details.reason).not.toContain('src/index.ts');
    // No glob in this config, so the glob advice must not fire.
    expect(res.error.suggestions.join('\n')).not.toContain('never glob patterns');
  });

  it('names the first three unresolvable entries in the message and counts the rest', async () => {
    // Consumers print only error.message, so the names must be in it — capped,
    // so a wholly stale 62-entry config does not produce an unreadable line.
    write('src/index.ts');
    const missing = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'];
    const res = await resolveEntryPoints(root, ['src/index.ts', ...missing]);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toBe(
      '5 of 6 configured entryPoints match no file: a.ts, b.ts, c.ts and 2 more'
    );
    // The uncapped list is still available to machine consumers.
    expect(res.error.details.issues).toEqual(missing);
  });

  it('rejects a directory, which parses as no file at all', async () => {
    write('src/index.ts'); // creates src/ as a directory
    const res = await resolveEntryPoints(root, ['src']);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.details.issues).toEqual(['src']);
  });

  it('still accepts a fully resolvable config, in order', async () => {
    write('src/index.ts');
    write('src/cli.ts');
    const res = await resolveEntryPoints(root, ['src/index.ts', 'src/cli.ts']);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([
      path.resolve(root, 'src/index.ts'),
      path.resolve(root, 'src/cli.ts'),
    ]);
  });
});

/**
 * The same defect on the auto-detection path: a `main`/`exports`/`bin` field
 * naming a build artifact that is not on disk yet short-circuited resolution
 * with a root that matches nothing AND suppressed the conventional fallback.
 */
describe('resolveEntryPoints — package.json fields that match no file (#2275)', () => {
  it('falls through to the conventional file when `main` names a missing artifact', async () => {
    write('package.json', JSON.stringify({ main: 'dist/index.js' }));
    write('src/index.ts');
    const res = await resolveEntryPoints(root);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The NAMED surviving root is the real file, not the unbuilt artifact.
    expect(res.value).toEqual([path.join(root, 'src/index.ts')]);
  });

  it('keeps the bin entries that exist and drops the one that does not', async () => {
    write('package.json', JSON.stringify({ bin: { foo: 'bin/foo.js', gone: 'bin/gone.js' } }));
    write('bin/foo.js');
    const res = await resolveEntryPoints(root);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([path.resolve(root, 'bin/foo.js')]);
  });
});
