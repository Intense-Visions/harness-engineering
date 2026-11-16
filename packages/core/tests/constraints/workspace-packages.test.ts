/**
 * Bare workspace-package specifiers are resolved for layer checks (#2216).
 *
 * `resolveImportPath` dropped every non-relative specifier, so an import of a
 * sibling workspace package (`@scope/pkg`) never became a graph edge and a
 * cross-package layer violation passed as "0 violations". In a monorepo that
 * is every package-to-package edge, so `allowedDependencies` were documented
 * but never enforced between packages.
 *
 * The resolution is opt-in (`resolveWorkspacePackages: true`) — enabling it on
 * an existing monorepo can surface violations that were previously invisible,
 * so the default keeps today's behaviour and the flag lets a project turn it on.
 *
 * Fixtures are written to a temp dir; paths are compared posix-normalised so the
 * assertions hold on win32.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateDependencies } from '../../src/constraints/dependencies';
import { defineLayer } from '../../src/constraints/layers';
import { TypeScriptParser } from '../../src/shared/parsers/typescript';

function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const posix = (p: string) => p.replace(/\\/g, '/');

describe('workspace package specifiers in layer validation (#2216)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-2216-'));
    write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
    write(
      root,
      'packages/low/package.json',
      JSON.stringify({ name: '@fx/low', exports: { '.': './dist/index.js' } })
    );
    write(
      root,
      'packages/high/package.json',
      JSON.stringify({
        name: '@fx/high',
        exports: { '.': './dist/index.js', './util': './dist/util.js' },
      })
    );
    write(
      root,
      'packages/high/src/index.ts',
      "import { base } from '@fx/low';\nexport const h = base;\n"
    );
    write(root, 'packages/high/src/util.ts', 'export const util = 1;\n');
    // The forbidden edge: the bottom layer importing the top one by bare name.
    write(
      root,
      'packages/low/src/index.ts',
      "import { h } from '@fx/high';\nexport const base = 1;\nexport const leak = h;\n"
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function config(resolveWorkspacePackages?: boolean) {
    return {
      layers: [
        defineLayer('low', ['packages/low/src/**'], []),
        defineLayer('high', ['packages/high/src/**'], ['low']),
      ],
      rootDir: root,
      parser: new TypeScriptParser(),
      ...(resolveWorkspacePackages !== undefined ? { resolveWorkspacePackages } : {}),
    };
  }

  it('reports a forbidden cross-package import made through a bare specifier', async () => {
    const result = await validateDependencies(config(true));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.violations).toHaveLength(1);
    const v = result.value.violations[0]!;
    expect(v.fromLayer).toBe('low');
    expect(v.toLayer).toBe('high');
    expect(posix(v.file)).toMatch(/packages\/low\/src\/index\.ts$/);
    expect(posix(v.imports)).toMatch(/packages\/high\/src\/index\.ts$/);
  });

  it('allows the permitted direction (high -> low) through a bare specifier', async () => {
    write(root, 'packages/low/src/index.ts', 'export const base = 1;\n');
    const result = await validateDependencies(config(true));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.violations).toHaveLength(0);
    // The allowed edge is in the graph — proof the specifier was resolved, not skipped.
    const edge = result.value.graph.edges.find((e) =>
      /packages\/high\/src\/index\.ts$/.test(posix(e.from))
    );
    expect(edge && posix(edge.to)).toMatch(/packages\/low\/src\/index\.ts$/);
  });

  it('resolves a subpath export from dist back to its source file', async () => {
    write(
      root,
      'packages/low/src/index.ts',
      "import { util } from '@fx/high/util';\nexport const base = util;\n"
    );
    const result = await validateDependencies(config(true));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.violations).toHaveLength(1);
    expect(posix(result.value.violations[0]!.imports)).toMatch(/packages\/high\/src\/util\.ts$/);
  });

  it('ignores bare specifiers that are not workspace packages', async () => {
    write(root, 'packages/low/src/index.ts', "import x from 'lodash';\nexport const base = x;\n");
    const result = await validateDependencies(config(true));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.violations).toHaveLength(0);
  });

  it('is opt-in: without the flag a bare cross-package import is not resolved', async () => {
    const result = await validateDependencies(config());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.violations).toHaveLength(0);
  });

  it('discovers packages from package.json "workspaces" when there is no pnpm-workspace.yaml', async () => {
    fs.rmSync(path.join(root, 'pnpm-workspace.yaml'));
    write(root, 'package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] }));
    const result = await validateDependencies(config(true));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.violations).toHaveLength(1);
  });

  it('maps package names to their directories', async () => {
    const { loadWorkspacePackages } = await import('../../src/constraints/workspace-packages');
    const pkgs = await loadWorkspacePackages(root);
    expect([...pkgs.keys()].sort()).toEqual(['@fx/high', '@fx/low']);
    expect(posix(pkgs.get('@fx/low')!.dir)).toMatch(/packages\/low$/);
  });
});
