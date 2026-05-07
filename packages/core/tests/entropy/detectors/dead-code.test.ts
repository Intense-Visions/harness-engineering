import { describe, it, expect } from 'vitest';
import { buildReachabilityMap, detectDeadCode } from '../../../src/entropy/detectors/dead-code';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { createRegionMap } from '../../../src/annotations';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';

describe('buildReachabilityMap', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-samples');

  it('should mark entry points as reachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    // Entry point should be reachable
    const indexFile = snapshotResult.value.entryPoints[0];
    expect(reachability.get(indexFile)).toBe(true);
  });

  it('should mark transitively imported files as reachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    // Files imported from entry point should be reachable
    const usedFile = snapshotResult.value.files.find((f) => f.path.includes('used.ts'));
    const helperFile = snapshotResult.value.files.find((f) => f.path.includes('helper.ts'));

    expect(usedFile).toBeDefined();
    expect(helperFile).toBeDefined();
    expect(reachability.get(usedFile!.path)).toBe(true);
    expect(reachability.get(helperFile!.path)).toBe(true);
  });

  it('should mark orphan files as unreachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    // unused.ts is not imported by anything
    const unusedFile = snapshotResult.value.files.find((f) => f.path.includes('unused.ts'));
    expect(unusedFile).toBeDefined();
    expect(reachability.get(unusedFile!.path)).toBe(false);
  });
});

describe('detectDeadCode', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-samples');

  it('should detect dead exports', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // unusedHelper in helper.ts is exported but never imported
      expect(result.value.deadExports.some((e) => e.name === 'unusedHelper')).toBe(true);

      // Functions in unused.ts are dead
      expect(result.value.deadExports.some((e) => e.name === 'unusedFunction')).toBe(true);
    }
  });

  it('should detect dead files', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // unused.ts is a dead file
      expect(result.value.deadFiles.some((f) => f.path.includes('unused.ts'))).toBe(true);
    }
  });

  it('should detect unused imports', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // with-unused-import.ts imports anotherHelper but doesn't use it
      const unusedImport = result.value.unusedImports.find((i) =>
        i.file.includes('with-unused-import.ts')
      );
      expect(unusedImport).toBeDefined();
      expect(unusedImport?.specifiers).toContain('anotherHelper');
    }
  });
});

describe('detectDeadCode with protectedRegions', () => {
  it('should skip dead exports on protected lines', async () => {
    const snapshot = {
      files: [],
      dependencyGraph: { nodes: [], edges: [] },
      exportMap: { byFile: new Map(), byName: new Map() },
      docs: [],
      codeReferences: [],
      entryPoints: [],
      rootDir: '/tmp',
      config: { rootDir: '/tmp', analyze: { deadCode: true } },
      buildTime: 0,
    } as never;

    const graphData = {
      reachableNodeIds: new Set(['node-1']),
      unreachableNodes: [
        { id: 'fn-1', type: 'function', name: 'protectedFn', path: 'src/protected.ts' },
        { id: 'fn-2', type: 'function', name: 'unprotectedFn', path: 'src/open.ts' },
      ],
    };

    const regions = createRegionMap([
      {
        file: 'src/protected.ts',
        startLine: 1,
        endLine: 10,
        scopes: ['entropy'],
        reason: 'compliance',
        type: 'block',
      },
    ]);

    const result = await detectDeadCode(snapshot, graphData, regions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.deadExports.some((e) => e.name === 'unprotectedFn')).toBe(true);
  });

  it('should skip dead files with any protected region', async () => {
    const snapshot = {
      files: [],
      dependencyGraph: { nodes: [], edges: [] },
      exportMap: { byFile: new Map(), byName: new Map() },
      docs: [],
      codeReferences: [],
      entryPoints: [],
      rootDir: '/tmp',
      config: { rootDir: '/tmp', analyze: { deadCode: true } },
      buildTime: 0,
    } as never;

    const graphData = {
      reachableNodeIds: new Set(['node-1']),
      unreachableNodes: [
        { id: 'file-1', type: 'file', name: 'protected-file', path: 'src/protected.ts' },
        { id: 'file-2', type: 'file', name: 'open-file', path: 'src/open.ts' },
      ],
    };

    const regions = createRegionMap([
      {
        file: 'src/protected.ts',
        startLine: 5,
        endLine: 10,
        scopes: ['all'],
        reason: 'vendor lock-in',
        type: 'block',
      },
    ]);

    const result = await detectDeadCode(snapshot, graphData, regions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.deadFiles.some((f) => f.path === 'src/protected.ts')).toBe(false);
    expect(result.value.deadFiles.some((f) => f.path === 'src/open.ts')).toBe(true);
  });

  it('should behave unchanged when no protectedRegions provided', async () => {
    const snapshot = {
      files: [],
      dependencyGraph: { nodes: [], edges: [] },
      exportMap: { byFile: new Map(), byName: new Map() },
      docs: [],
      codeReferences: [],
      entryPoints: [],
      rootDir: '/tmp',
      config: { rootDir: '/tmp', analyze: { deadCode: true } },
      buildTime: 0,
    } as never;

    const graphData = {
      reachableNodeIds: new Set(['node-1']),
      unreachableNodes: [{ id: 'file-1', type: 'file', name: 'dead-file', path: 'src/dead.ts' }],
    };

    const result = await detectDeadCode(snapshot, graphData);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.deadFiles).toHaveLength(1);
    expect(result.value.deadFiles[0].path).toBe('src/dead.ts');
  });
});

describe('buildReachabilityMap with NodeNext .js import extensions (issue #279)', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-nodenext');

  it('resolves "./app.js" to app.ts and marks it reachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
      entryPoints: ['src/index.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    const appFile = snapshotResult.value.files.find((f) => f.path.endsWith('/src/app.ts'));
    expect(appFile, 'app.ts must be in the snapshot').toBeDefined();
    expect(reachability.get(appFile!.path)).toBe(true);
  });

  it('resolves "./utils/helper.js" through a subdirectory to helper.ts', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
      entryPoints: ['src/index.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    const helperFile = snapshotResult.value.files.find((f) =>
      f.path.endsWith('/src/utils/helper.ts')
    );
    expect(helperFile).toBeDefined();
    expect(reachability.get(helperFile!.path)).toBe(true);
  });

  it('resolves "./folder/index.js" to folder/index.ts', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
      entryPoints: ['src/index.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    const folderIndexFile = snapshotResult.value.files.find((f) =>
      f.path.endsWith('/src/folder/index.ts')
    );
    expect(folderIndexFile).toBeDefined();
    expect(reachability.get(folderIndexFile!.path)).toBe(true);
  });

  it('does not flag NodeNext-imported files as dead in the full report', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
      entryPoints: ['src/index.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const deadPaths = result.value.deadFiles.map((f) => f.path);
    expect(deadPaths.some((p) => p.endsWith('/src/app.ts'))).toBe(false);
    expect(deadPaths.some((p) => p.endsWith('/src/utils/helper.ts'))).toBe(false);
    expect(deadPaths.some((p) => p.endsWith('/src/folder/index.ts'))).toBe(false);
  });
});
