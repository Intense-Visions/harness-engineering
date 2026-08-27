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
 * FIX 1 seam — the D6 dispatch pre-warm's REAL disk-backed store/reader under
 * cwd != project root.
 *
 * `resolveLeafPrewarmBestEffort` (behind both public entry points) built the store
 * with the RELATIVE default root (resolved against cwd) while its reader + the
 * `existsSync` guard were rooted at the passed-in `root`. When cwd != root the
 * store enumerated an empty cwd tree, so a committed fresh unit was NEVER served
 * and the pre-warm silently degraded to an empty block. After the fix the store is
 * rooted at the SAME absolute `root`, so the committed unit is found and served.
 */
describe('resolveStagePrewarmBlock / resolveLeafPrewarmSources — cwd != root seam (FIX 1)', () => {
  const originalCwd = process.cwd();
  afterEach(() => process.chdir(originalCwd));

  function buildProjectTree(): { root: string; module: string } {
    const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'comp-seam-prewarm-'));
    const module = 'src/widget';
    fs.mkdirSync(nodePath.join(root, module), { recursive: true });
    fs.writeFileSync(
      nodePath.join(root, module, 'widget.ts'),
      'export const widget = () => 42;\n',
      'utf-8'
    );
    return { root, module };
  }

  async function commitFreshUnit(root: string, module: string): Promise<void> {
    const reader = createNodeModuleSourceReader(root);
    const source = (await reader.readModuleSource(module))!;
    const store = new ComprehensionStore({
      root: `${root.replaceAll('\\', '/')}/.harness/comprehension`,
      io: createNodeComprehensionIO(),
    });
    const unit: ComprehensionUnit = {
      provenance: {
        schemaVersion: 1,
        module,
        sourceHash: computeSourceHash(source),
        compiledAt: '2026-08-27T00:00:00.000Z',
        compiler: { static: '1.0.0', semantic: '1.0.0' },
        model: null,
        semantic: 'absent',
        members: source.map((f) => f.path),
      },
      summary: 'the pre-warmed widget summary',
      invariants: [],
      interfaceContract: 'export const widget: () => number',
      dependencySlice: 'imports: none',
    };
    expect((await store.write(unit)).ok).toBe(true);
  }

  it('serves the committed unit into the pre-warm block even when cwd differs', async () => {
    const { root, module } = buildProjectTree();
    await commitFreshUnit(root, module);
    const cwdElsewhere = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'comp-seam-cwd-'));
    process.chdir(cwdElsewhere);
    expect(process.cwd()).not.toBe(root);

    // Issue references the module by a file path so it is a pre-warm seed.
    const block = await resolveStagePrewarmBlock(
      issue({ description: `Touches ${module}/widget.ts for the change.` }),
      root
    );
    expect(block).toContain('export const widget: () => number');
  });

  it('attributes served-unit token sources even when cwd differs', async () => {
    const { root, module } = buildProjectTree();
    await commitFreshUnit(root, module);
    const cwdElsewhere = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'comp-seam-cwd2-'));
    process.chdir(cwdElsewhere);

    const sources = await resolveLeafPrewarmSources(
      issue({ description: `Touches ${module}/widget.ts for the change.` }),
      root
    );
    expect(sources.map((s) => s.label)).toContain(module);
    expect(sources.every((s) => s.tokens > 0)).toBe(true);
  });
});
