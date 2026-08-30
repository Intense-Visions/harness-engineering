import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import {
  computeSourceHash,
  ComprehensionStore,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
  type ComprehensionUnit,
} from '@harness-engineering/core';
import { GraphStore } from '@harness-engineering/graph';
import type { Issue } from '@harness-engineering/types';
import { resolveStagePrewarmBlock, resolveLeafPrewarmSources } from './orchestrator-context';

function issue(over: Partial<Issue> = {}): Issue {
  return {
    id: 'iss-1',
    identifier: 'ISS-1',
    title: 'Do the thing',
    description: null,
    priority: null,
    state: 'planned',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: null,
    ...over,
  };
}

/**
 * #1690 WIRED seam — proves the dispatch pre-warm enriches a leaf with its 1-hop
 * blast-radius (importer) comprehension when a graph is present on disk, and
 * degrades to a seed-only block when it is not.
 */
describe('resolveStagePrewarmBlock — 1-hop blast-radius enrichment (#1690)', () => {
  const originalCwd = process.cwd();
  afterEach(() => process.chdir(originalCwd));

  function writeModule(root: string, module: string, file: string, content: string): void {
    fs.mkdirSync(nodePath.join(root, module), { recursive: true });
    fs.writeFileSync(nodePath.join(root, module, file), content, 'utf-8');
  }

  async function commitUnit(
    root: string,
    module: string,
    contract: string,
    summary: string
  ): Promise<void> {
    const reader = createNodeModuleSourceReader(root);
    const src = (await reader.readModuleSource(module))!;
    const store = new ComprehensionStore({
      root: `${root.replaceAll('\\', '/')}/.harness/comprehension`,
      io: createNodeComprehensionIO(),
    });
    const unit: ComprehensionUnit = {
      provenance: {
        schemaVersion: 1,
        module,
        sourceHash: computeSourceHash(src),
        compiledAt: '2026-08-27T00:00:00.000Z',
        compiler: { static: '1.0.0', semantic: '1.0.0' },
        model: null,
        semantic: 'absent',
        members: src.map((f) => f.path),
      },
      summary,
      invariants: [],
      interfaceContract: contract,
      dependencySlice: 'imports: none',
    };
    expect((await store.write(unit)).ok).toBe(true);
  }

  /** Build a project: seed module `src/core` imported by `src/cli`, both with units. */
  async function buildProject(): Promise<{ root: string; seed: string; importer: string }> {
    const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'blast-radius-seam-'));
    const seed = 'src/core';
    const importer = 'src/cli';
    writeModule(root, seed, 'core.ts', 'export const core = () => 1;\n');
    writeModule(
      root,
      importer,
      'cli.ts',
      "import { core } from '../core/core';\nexport const cli = () => core();\n"
    );
    await commitUnit(root, seed, 'export const core: () => number', 'the core summary');
    await commitUnit(root, importer, 'export const cli: () => number', 'the cli summary');
    return { root, seed, importer };
  }

  async function writeGraph(root: string, seed: string, importer: string): Promise<void> {
    const store = new GraphStore();
    const seedFile = `${seed}/core.ts`;
    const importerFile = `${importer}/cli.ts`;
    store.addNode({
      id: `file:${seedFile}`,
      type: 'file',
      name: seedFile,
      path: seedFile,
      metadata: {},
    });
    store.addNode({
      id: `file:${importerFile}`,
      type: 'file',
      name: importerFile,
      path: importerFile,
      metadata: {},
    });
    // importer imports seed ⇒ seed's 1-hop blast radius is the importer module.
    store.addEdge({ from: `file:${importerFile}`, to: `file:${seedFile}`, type: 'imports' });
    await store.save(nodePath.join(root, '.harness', 'graph'));
  }

  it('enriches the pre-warm with the seed module 1-hop importer when a graph exists', async () => {
    const { root, seed, importer } = await buildProject();
    await writeGraph(root, seed, importer);
    const cwdElsewhere = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'blast-cwd-'));
    process.chdir(cwdElsewhere);

    const block = await resolveStagePrewarmBlock(
      issue({ description: `Touches ${seed}/core.ts for the change.` }),
      root
    );
    // Seed contract present…
    expect(block).toContain('export const core: () => number');
    // …AND the 1-hop importer contract (the blast-radius enrichment).
    expect(block).toContain('export const cli: () => number');

    const sources = await resolveLeafPrewarmSources(
      issue({ description: `Touches ${seed}/core.ts for the change.` }),
      root
    );
    expect(sources.map((s) => s.label).sort()).toEqual([importer, seed].sort());
  });

  it('degrades to a seed-only block when no graph is present (byte-identical, SC3)', async () => {
    const { root, seed } = await buildProject();
    // No graph written.
    const block = await resolveStagePrewarmBlock(
      issue({ description: `Touches ${seed}/core.ts for the change.` }),
      root
    );
    expect(block).toContain('export const core: () => number');
    expect(block).not.toContain('export const cli: () => number');
  });
});
