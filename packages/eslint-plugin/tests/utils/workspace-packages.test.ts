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
