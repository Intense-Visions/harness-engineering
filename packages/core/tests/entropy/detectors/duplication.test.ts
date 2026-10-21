import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

  it('reports the LARGEST class and records the drop (criterion 13)', async () => {
    // Retitled: the committed fixture holds only plain duplicates, where
    // `priority === rank`, so this cannot tell the keys apart. Criterion 13's
    // `priority` clause is proved in `duplication/partial-extraction.test.ts`.
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

  it('leaves every class in the committed fixture a plain duplicate', async () => {
    // Truth 12: the Phase-1/2/3 fixture must keep reporting exactly what it
    // reported before the signal existed, including `priority === rank`.
    const result = await detectDuplication(await plantedSnapshot(), { ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    for (const cls of result.value.classes) {
      expect(cls.signal).toBe('duplicate');
      expect(cls.sharedImport).toBeUndefined();
      expect(cls.priority).toBe(cls.rank);
    }
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

describe('detectDuplication failure behavior', () => {
  it('skips an unreadable file, records it, and still returns Ok (criterion 12)', async () => {
    const snapshot = snapshotOf(
      [join(PLANTED, 'src/alpha.ts'), join(PLANTED, 'src/does-not-exist.ts')],
      PLANTED
    );
    const result = await detectDuplication(snapshot, {
      ignorePatterns: [],
      minInstances: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stats.filesScanned).toBe(1);
    expect(result.value.stats.filesSkipped).toBe(1);
    expect(result.value.skipErrors).toHaveLength(1);
    const error = result.value.skipErrors[0]!;
    // `details.reason` is the discriminator; `code` is PARSE_ERROR for every
    // skip reason and for unrelated entropy failures, so it discriminates
    // nothing.
    expect(error.details.reason).toBe('unreadable');
    expect(error.details.file).toBe('src/does-not-exist.ts');
    expect(error.details.originalError).toBeInstanceOf(Error);
    expect(error.suggestions.length).toBeGreaterThan(0);
  });

  it('skips an unparseable file with reason `unparseable`', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const root = await mkdtemp(join(tmpdir(), 'dup-detector-'));
    try {
      await writeFile(join(root, 'broken.ts'), 'export function (((( {', 'utf8');
      await writeFile(join(root, 'fine.ts'), 'export const ok = 1;\n', 'utf8');
      const result = await detectDuplication(
        snapshotOf([join(root, 'broken.ts'), join(root, 'fine.ts')], root),
        { ignorePatterns: [] }
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.skipErrors).toHaveLength(1);
      expect(result.value.skipErrors[0]!.details.reason).toBe('unparseable');
      expect(result.value.stats.filesSkipped).toBe(1);
      expect(result.value.stats.filesScanned).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keys the remediation advice to the reason rather than emitting one fixed string', async () => {
    // The four reasons exist so the advice can differ — advising "check file
    // permissions" for a digest failure in our own code is actively
    // misleading. Prove the advice is reason-keyed by forcing the two reasons
    // that ARE forceable and asserting their suggestions diverge; a single
    // hardcoded advice string passes every other test in this file.
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const root = await mkdtemp(join(tmpdir(), 'dup-advice-'));
    try {
      await writeFile(join(root, 'broken.ts'), 'export function (((( {', 'utf8');
      await writeFile(join(root, 'fine.ts'), 'export const ok = 1;\n', 'utf8');
      const result = await detectDuplication(
        snapshotOf([join(root, 'broken.ts'), join(root, 'gone.ts'), join(root, 'fine.ts')], root),
        { ignorePatterns: [] }
      );
      if (!result.ok) throw new Error('expected ok');
      const byReason = new Map(
        result.value.skipErrors.map((e) => [e.details.reason as string, e.suggestions.join(' ')])
      );
      // Pin both denominators before comparing, so a missing skip cannot make
      // this a vacuous pass.
      expect(byReason.get('unreadable')).toBeDefined();
      expect(byReason.get('unparseable')).toBeDefined();
      expect(byReason.get('unreadable')).not.toBe(byReason.get('unparseable'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('adds a truncation entry when skip evidence exceeds the evidence cap', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { MAX_EVIDENCE_ENTRIES } = await import('../../../src/duplication');
    const root = await mkdtemp(join(tmpdir(), 'dup-truncate-'));
    try {
      // One more broken file than the evidence cap, plus one good file so the
      // run is a PARTIAL skip (Ok) rather than an all-skip refusal.
      const broken = MAX_EVIDENCE_ENTRIES + 1;
      const paths: string[] = [];
      for (let i = 0; i < broken; i++) {
        const file = join(root, `broken-${i}.ts`);
        await writeFile(file, 'export function (((( {', 'utf8');
        paths.push(file);
      }
      const good = join(root, 'fine.ts');
      await writeFile(good, 'export const ok = 1;\n', 'utf8');
      paths.push(good);

      const result = await detectDuplication(snapshotOf(paths, root), {
        ignorePatterns: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stats.filesSkipped).toBe(broken);
      expect(result.value.stats.skippedTruncated).toBe(broken - MAX_EVIDENCE_ENTRIES);
      // The capped sample, plus exactly one entry saying the sample is capped.
      expect(result.value.skipErrors).toHaveLength(MAX_EVIDENCE_ENTRIES + 1);
      const last = result.value.skipErrors[result.value.skipErrors.length - 1]!;
      expect(last.details.reason).toBe('skips-truncated');
      // The EXACT count, not the capped sample's size: the truncation entry
      // exists precisely so the honest total survives the cap.
      expect(last.message).toContain(String(broken));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses to report a pass over zero discovered files (criterion 14)', async () => {
    const result = await detectDuplication(snapshotOf([], PLANTED));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details.reason).toBe('zero-files-discovered');
    expect(result.error.message).toMatch(/zero source files/i);
  });

  it('refuses to report a pass when every eligible file was skipped', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const root = await mkdtemp(join(tmpdir(), 'dup-allskip-'));
    try {
      await writeFile(join(root, 'broken.ts'), 'export function (((( {', 'utf8');
      const result = await detectDuplication(snapshotOf([join(root, 'broken.ts')], root), {
        ignorePatterns: [],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details.reason).toBe('all-files-skipped');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('drops an ineligible path into filesIgnored, counting it in neither scanned nor skipped', async () => {
    const paths = await findFiles(INCLUDE, PLANTED);
    expect(paths.some((p) => p.endsWith('notes.md'))).toBe(true);
    const result = await detectDuplication(snapshotOf(paths, PLANTED), {
      ignorePatterns: [],
    });
    if (!result.ok) throw new Error('expected ok');
    const stats = result.value.stats;
    expect(stats.filesIgnored).toBe(paths.length - stats.filesScanned - stats.filesSkipped);
    expect(stats.filesIgnored).toBeGreaterThan(0);
  });
});

describe('detectDuplication — the Phase-4 fields survive the detector', () => {
  /**
   * The detector spreads `index.classes` straight through, so this case pins
   * the PASS-THROUGH rather than re-testing the derivation core already
   * covers. Without it, "the new fields flow automatically" is true today and
   * guarded by nothing: a future revision that projects the classes
   * field-by-field would drop `signal` silently.
   */
  const wrapper = (spec: string, fn: string, p: string, out: string) =>
    `import { extract } from '${spec}';\n` +
    `export function ${fn}(${p}: string[]): string[] {\n` +
    `  const ${out}: string[] = [];\n` +
    `  for (const item of ${p}) {\n` +
    `    const value = extract(item);\n` +
    `    if (value.length > 0) {\n` +
    `      ${out}.push(value);\n` +
    `    }\n` +
    `  }\n` +
    `  return ${out};\n` +
    `}\n`;

  it('carries signal, sharedImport and the boosted priority through detectDuplication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dup-det-pe-'));
    try {
      const files: Record<string, string> = {
        'src/shared/extract.ts': `export function extract(raw: string): string {\n  return raw.trim();\n}\n`,
        'src/beta.ts': wrapper('./shared/extract.js', 'keepBeta', 'rows', 'kept'),
        'src/wrappers/alpha.ts': wrapper('../shared/extract.js', 'keepAlpha', 'items', 'out'),
        'src/deep/nested/gamma.ts': wrapper(
          '../../shared/extract.js',
          'keepGamma',
          'entries',
          'acc'
        ),
      };
      for (const [rel, src] of Object.entries(files)) {
        await mkdir(join(root, rel, '..'), { recursive: true });
        await writeFile(join(root, rel), src, 'utf8');
      }
      const snapshot = snapshotOf(
        Object.keys(files).map((f) => join(root, f)),
        root
      );
      const result = await detectDuplication(snapshot, { ignorePatterns: [] });
      if (!result.ok) throw new Error(`expected ok: ${result.error.message}`);
      expect(result.value.classes).toHaveLength(1);
      const cls = result.value.classes[0]!;
      expect(cls.signal).toBe('partial-extraction');
      expect(cls.sharedImport).toBe('src/shared/extract');
      expect(cls.rank).toBe(186);
      expect(cls.priority).toBe(372);
      expect(cls.priority).toBe(cls.rank * 2);
      // The seam Phase 5 reads from must hand back the LABELLED object, not a
      // stripped copy of it.
      const member = cls.members[0]!;
      expect(result.value.byMember.get(`${member.file}:${member.startLine}`)).toBe(cls);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
