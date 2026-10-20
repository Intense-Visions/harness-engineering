import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { findFiles } from '../../../src/shared/fs-utils';
import { detectDuplication } from '../../../src/entropy/detectors/duplication';
import type { CodebaseSnapshot } from '../../../src/entropy/types';

const PLANTED = join(__dirname, '../../fixtures/duplication/planted-clones');

/**
 * The minimal snapshot `detectDuplication` actually reads: it consumes only
 * `files[].path` and `rootDir` (planning decision P1), then re-parses every
 * file itself with estree (spec decision D7). Building one directly keeps
 * these tests off `buildSnapshot`'s tree-sitter pass, which is both slow and
 * irrelevant to what is under test. Precedent:
 * `architecture/collectors/complexity.ts:8-26` does the same.
 */
function snapshotOf(paths: string[], rootDir: string): CodebaseSnapshot {
  return {
    files: paths.map((path) => ({
      path,
      ast: { type: 'Program', body: null, language: 'typescript' },
      imports: [],
      exports: [],
      internalSymbols: [],
      jsDocComments: [],
    })),
    dependencyGraph: { nodes: [], edges: [] },
    exportMap: { byFile: new Map(), byName: new Map() },
    docs: [],
    codeReferences: [],
    entryPoints: [],
    rootDir,
    config: { rootDir, analyze: {} },
    buildTime: 0,
  } as unknown as CodebaseSnapshot;
}

/** Hoisted: the arch analyzer counts parameters by splitting on commas, so a
 *  brace-expansion glob in a default value reads as six extra parameters. */
const INCLUDE = '**/*.{ts,tsx,js,jsx,mjs,cjs,md}';

const CLASS_A = 'src/alpha.ts,src/beta.ts,src/gamma.ts';
const CLASS_D = 'src/generated/gen-a.ts,src/generated/gen-b.ts,src/generated/gen-c.ts';

function memberSets(classes: { members: { file: string }[] }[]): string[] {
  return classes
    .map((c) =>
      c.members
        .map((m) => m.file)
        .sort()
        .join(',')
    )
    .sort();
}

async function plantedSnapshot(): Promise<CodebaseSnapshot> {
  return snapshotOf(await findFiles(INCLUDE, PLANTED), PLANTED);
}

describe('detectDuplication over the planted-clones fixture', () => {
  it('publishes exactly the planted classes that meet both bars', async () => {
    const result = await detectDuplication(await plantedSnapshot(), { ignorePatterns: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(memberSets(result.value.classes)).toEqual([CLASS_A, CLASS_D].sort());
    expect(result.value.stats.classesReported).toBe(2);
  });

  it('carries the byMember seam keyed on `${file}:${startLine}`', async () => {
    const result = await detectDuplication(await plantedSnapshot(), { ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    const index = result.value;
    // Derived, not hardcoded: every reported member must be reachable.
    const members = index.classes.flatMap((c) => c.members);
    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      expect(index.byMember.get(`${member.file}:${member.startLine}`)).toBeDefined();
    }
    expect(index.byMember.size).toBe(members.length);
  });

  it('reports zero collisions and zero skips over a clean fixture', async () => {
    const result = await detectDuplication(await plantedSnapshot(), { ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.collisions).toEqual([]);
    expect(result.value.skipErrors).toEqual([]);
    expect(result.value.stats.filesSkipped).toBe(0);
    expect(result.value.stats.collisionsObserved).toBe(0);
  });

  it('threads the duplication config through to the index', async () => {
    const snapshot = await plantedSnapshot();
    const relaxed = await detectDuplication(snapshot, {
      ignorePatterns: [],
      minInstances: 2,
    });
    if (!relaxed.ok) throw new Error('expected ok');
    // Class B (2 members) surfaces only because minInstances was threaded.
    expect(memberSets(relaxed.value.classes)).toContain('src/pair-one.ts,src/pair-two.ts');
    expect(relaxed.value.stats.classesSuppressed).toBe(0);
  });

  it('reports the top class by rank and records the drop (criterion 13)', async () => {
    const result = await detectDuplication(await plantedSnapshot(), {
      ignorePatterns: [],
      maxClasses: 1,
    });
    if (!result.ok) throw new Error('expected ok');
    // Class D (87 tokens x 3 = 261) outranks Class A (83 x 3 = 249).
    expect(memberSets(result.value.classes)).toEqual([CLASS_D]);
    expect(result.value.stats.classesTruncated).toBe(1);
  });

  it('tallies every class as advisory and exposes no error or warning count (D4)', async () => {
    const result = await detectDuplication(await plantedSnapshot(), { ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    const stats = result.value.stats;
    expect(stats.violationCount).toBe(stats.classesReported);
    expect(stats.infoCount).toBe(stats.classesReported);
    expect(stats).not.toHaveProperty('errorCount');
    expect(stats).not.toHaveProperty('warningCount');
  });

  it('applies the duplication ignorePatterns on top of what the snapshot delivered', async () => {
    // The snapshot carries all 12 source files; the duplication-specific
    // filter is what drops the generated class here.
    const result = await detectDuplication(await plantedSnapshot(), {
      ignorePatterns: ['**/generated/**'],
    });
    if (!result.ok) throw new Error('expected ok');
    expect(memberSets(result.value.classes)).toEqual([CLASS_A]);
    expect(result.value.stats.filesScanned).toBe(9);
  });
});
