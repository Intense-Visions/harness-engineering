// tests/utils/workspace-packages.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  clearWorkspaceCache,
  loadWorkspacePackages,
  parsePnpmWorkspacePackages,
  resolveWorkspaceImport,
  resolveWorkspaceSpecifier,
  splitBareSpecifier,
} from '../../src/utils/workspace-packages';

const ws = path.join(__dirname, '../fixtures/workspace');
const posix = (p: string) => p.replace(/\\/g, '/');

describe('parsePnpmWorkspacePackages', () => {
  it('reads a block sequence and stops at the next key', () => {
    const yaml =
      "packages:\n  - 'packages/*'\n  - \"apps/**\" # comment\n  - '!apps/x'\nother: 1\n";
    expect(parsePnpmWorkspacePackages(yaml)).toEqual(['packages/*', 'apps/**', '!apps/x']);
  });
  it('reads a flow sequence', () => {
    expect(parsePnpmWorkspacePackages('packages: [\'a/*\', "b"]\n')).toEqual(['a/*', 'b']);
  });
  it('returns [] without a packages key', () => {
    expect(parsePnpmWorkspacePackages('autoInstallPeers: true\n')).toEqual([]);
  });
});

describe('splitBareSpecifier', () => {
  it('splits scoped and unscoped specifiers', () => {
    expect(splitBareSpecifier('@a/b')).toEqual({ name: '@a/b', subpath: '.' });
    expect(splitBareSpecifier('@a/b/c/d')).toEqual({ name: '@a/b', subpath: './c/d' });
    expect(splitBareSpecifier('lodash/fp')).toEqual({ name: 'lodash', subpath: './fp' });
  });
  it('rejects relative, absolute and protocol specifiers', () => {
    expect(splitBareSpecifier('./x')).toBeNull();
    expect(splitBareSpecifier('/x')).toBeNull();
    expect(splitBareSpecifier('node:fs')).toBeNull();
    expect(splitBareSpecifier('@scope')).toBeNull();
  });
});

describe('fixture workspace (pnpm-workspace.yaml)', () => {
  it('maps only workspace members', () => {
    const pkgs = loadWorkspacePackages(ws);
    expect([...pkgs.keys()].sort()).toEqual([
      '@fixture-ws/cli',
      '@fixture-ws/core',
      '@fixture-ws/misc',
      '@fixture-ws/types',
    ]);
  });
  it('resolves root, subpath, main and fallback targets to src', () => {
    const pkgs = loadWorkspacePackages(ws);
    const rel = (s: string) => {
      const r = resolveWorkspaceSpecifier(s, pkgs);
      return r ? path.posix.relative(posix(ws), r) : null;
    };
    expect(rel('@fixture-ws/core')).toBe('packages/core/src/index.ts');
    expect(rel('@fixture-ws/core/internal')).toBe('packages/core/src/internal/index.ts');
    expect(rel('@fixture-ws/types')).toBe('packages/types/src/index.ts');
    expect(rel('@fixture-ws/cli')).toBe('packages/cli/src/index.ts');
    expect(rel('@fixture-ws/core/nope')).toBeNull();
    expect(rel('lodash')).toBeNull();
  });
});

describe('package.json workspaces + caching', () => {
  let tmp: string;
  beforeEach(() => {
    clearWorkspaceCache();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-ws-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: { packages: ['libs/**'] } })
    );
    const lib = path.join(tmp, 'libs', 'nested', 'a');
    fs.mkdirSync(path.join(lib, 'src'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'package.json'), JSON.stringify({ name: 'lib-a' }));
    fs.writeFileSync(path.join(lib, 'src', 'index.ts'), 'export {};');
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    clearWorkspaceCache();
  });

  it('expands ** workspace globs from package.json', () => {
    expect([...loadWorkspacePackages(tmp).keys()]).toEqual(['lib-a']);
  });

  it('builds the workspace map once per root', () => {
    const first = resolveWorkspaceImport('lib-a', tmp);
    expect(first && path.posix.relative(posix(tmp), first)).toBe('libs/nested/a/src/index.ts');
    // Remove the manifest: a cached map still resolves; a cleared cache does not.
    fs.rmSync(path.join(tmp, 'libs', 'nested', 'a', 'package.json'));
    expect(resolveWorkspaceImport('lib-a', tmp)).toBe(first);
    clearWorkspaceCache();
    expect(resolveWorkspaceImport('lib-a', tmp)).toBeNull();
  });

  it('returns null for a directory with no workspace', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-nows-'));
    try {
      expect(resolveWorkspaceImport('lib-a', empty)).toBeNull();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('manifest shapes', () => {
  let tmp: string;
  const write = (rel: string, content: string) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  const pkg = (dir: string, manifest: object) =>
    write(`${dir}/package.json`, JSON.stringify(manifest));
  const rel = (abs: string | null) => (abs ? path.posix.relative(posix(tmp), abs) : null);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-wsm-'));
    // Array workspaces, unquoted entries, an exclusion and a brace glob.
    write('package.json', JSON.stringify({ workspaces: ['pkgs/*', '!pkgs/skip', 'x/{a,b}'] }));
    pkg('pkgs/str', { name: 'str', exports: './dist/main.js' });
    write('pkgs/str/src/main.ts', '');
    pkg('pkgs/arr', { name: 'arr', exports: { '.': [{ import: './lib/a.mjs' }, './src/b.ts'] } });
    write('pkgs/arr/src/a.mts', '');
    pkg('pkgs/dts', { name: 'dts', exports: { '.': { types: './src/types.d.ts' } } });
    write('pkgs/dts/src/types.ts', '');
    pkg('pkgs/exact', { name: 'exact', source: './src/entry.tsx' });
    write('pkgs/exact/src/entry.tsx', '');
    pkg('pkgs/sub', { name: 'sub' });
    write('pkgs/sub/src/deep/thing.ts', '');
    pkg('pkgs/nostr', { name: 'nostr', exports: { '.': { types: 42 } }, main: 3 });
    pkg('pkgs/skip', { name: 'skip' });
    pkg('pkgs/zdup', { name: 'str' }); // sorts after pkgs/str: first wins
    pkg('pkgs/noname', { version: '1' });
    write('pkgs/bad/package.json', '{not json');
    write('pkgs/nullish/package.json', 'null');
    pkg('x/a', { name: 'xa' });
    pkg('x/c', { name: 'xc' });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('honours exclusions, brace globs, duplicates and invalid manifests', () => {
    expect([...loadWorkspacePackages(tmp).keys()].sort()).toEqual([
      'arr',
      'dts',
      'exact',
      'nostr',
      'str',
      'sub',
      'xa',
    ]);
  });

  it('resolves string, array, .d.ts, exact and unexported-subpath targets', () => {
    const pkgs = loadWorkspacePackages(tmp);
    expect(rel(resolveWorkspaceSpecifier('str', pkgs))).toBe('pkgs/str/src/main.ts');
    expect(rel(resolveWorkspaceSpecifier('arr', pkgs))).toBe('pkgs/arr/src/a.mts');
    expect(rel(resolveWorkspaceSpecifier('dts', pkgs))).toBe('pkgs/dts/src/types.ts');
    expect(rel(resolveWorkspaceSpecifier('exact', pkgs))).toBe('pkgs/exact/src/entry.tsx');
    expect(rel(resolveWorkspaceSpecifier('sub/src/deep/thing', pkgs))).toBe(
      'pkgs/sub/src/deep/thing.ts'
    );
    // A non-subpath `exports` string declares nothing for a subpath.
    expect(resolveWorkspaceSpecifier('str/other', pkgs)).toBeNull();
    // Non-string export targets and main are ignored.
    expect(resolveWorkspaceSpecifier('nostr', pkgs)).toBeNull();
    expect(resolveWorkspaceSpecifier('./str', pkgs)).toBeNull();
  });

  it('treats unreadable workspace declarations as no workspace', () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-wsb-'));
    try {
      fs.writeFileSync(path.join(other, 'package.json'), JSON.stringify({ workspaces: 'nope' }));
      expect(loadWorkspacePackages(other).size).toBe(0);
      fs.writeFileSync(path.join(other, 'package.json'), '[1]');
      expect(loadWorkspacePackages(other).size).toBe(0);
      fs.mkdirSync(path.join(other, 'pnpm-workspace.yaml'));
      expect(loadWorkspacePackages(other).size).toBe(0);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it('parses unquoted pnpm entries', () => {
    expect(parsePnpmWorkspacePackages('packages:\n  - pkgs/*\n\n  - "x"\n')).toEqual([
      'pkgs/*',
      'x',
    ]);
  });
});
