import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { findFiles } from '../../src/shared/fs-utils';
import { buildCloneIndex } from '../../src/duplication/index';

const PLANTED_ROOT = join(__dirname, '../fixtures/duplication/planted-clones');
const NESTED_ROOT = join(__dirname, '../fixtures/duplication/nested-units');

/**
 * The default include glob. Hoisted to a constant rather than written as a
 * parameter default because the architecture analyzer counts parameters by
 * splitting the parameter text on commas, so a brace-expansion glob in a
 * default value reads as six extra parameters.
 */
const DEFAULT_INCLUDE = '**/*.{ts,tsx,js,jsx,mjs,cjs,md}';

/** Discovery driven solely by include globs — criterion 15. */
async function discover(root: string, include = DEFAULT_INCLUDE) {
  return findFiles(include, root);
}

/** The planted set, named by the fixture README. */
const CLASS_A_MEMBERS = ['src/alpha.ts', 'src/beta.ts', 'src/gamma.ts'];
const CLASS_D_MEMBERS = [
  'src/generated/gen-a.ts',
  'src/generated/gen-b.ts',
  'src/generated/gen-c.ts',
];
const CLASS_B_MEMBERS = ['src/pair-one.ts', 'src/pair-two.ts'];
const CLASS_C_MEMBERS = ['src/short-one.ts', 'src/short-three.ts', 'src/short-two.ts'];

/**
 * The fixture's units that fall below the default `minTokens` of 40, measured:
 * the three 16-token `src/short-*.ts` functions. Under the amended spec these
 * are excluded before grouping, so they are counted in `unitsBelowMinTokens`
 * and can never appear in `classesSuppressed`.
 *
 * `src/unique.ts` is NOT among them — at 139 tokens it clears the bar and
 * forms a singleton group, which is exactly the path it exists to cover.
 */
const SUB_MIN_TOKEN_UNITS = 3;
/** Every planted file holds exactly one function, so 12 source files -> 12 units. */
const TOTAL_UNITS = 12;

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

describe('buildCloneIndex over the planted-clones fixture (criterion 15)', () => {
  it('reports exactly the planted classes that meet both bars, and no others', async () => {
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const index = result.value;

    const expected = [CLASS_A_MEMBERS.join(','), CLASS_D_MEMBERS.join(',')].sort();
    expect(memberSets(index.classes)).toEqual(expected);
    expect(index.stats.classesReported).toBe(expected.length);
  });

  it('counts the one formed-then-dropped class in classesSuppressed', async () => {
    // Class B formed with 2 members and was dropped by minInstances 3, so it is
    // the ONLY suppressed class. Class C's three 16-token units never reached
    // grouping at all, so they are not a suppressed class — see the next case.
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.stats.classesSuppressed).toBe(1);
  });

  it('fingerprints the one unique unit and counts its singleton group nowhere', async () => {
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    const stats = result.value.stats;
    // src/unique.ts clears minTokens, so it IS hashed...
    expect(stats.unitsFingerprinted).toBe(TOTAL_UNITS - SUB_MIN_TOKEN_UNITS);
    // ...and its group holds one member, so it is not duplication: it appears
    // in no class and, critically, is NOT counted in classesSuppressed, which
    // is reserved for classes that formed with >= 2 members.
    const reported = result.value.classes.flatMap((c) => c.members.map((m) => m.file));
    expect(reported).not.toContain('src/unique.ts');
    expect(stats.classesSuppressed).toBe(1);
    expect(stats.classesReported).toBe(2);
  });

  it('counts the sub-minTokens units in unitsBelowMinTokens, never in classesSuppressed', async () => {
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    const stats = result.value.stats;
    expect(stats.unitsBelowMinTokens).toBe(SUB_MIN_TOKEN_UNITS);
    expect(stats.unitsFingerprinted).toBe(TOTAL_UNITS - SUB_MIN_TOKEN_UNITS);
    // Not a single reported class draws a member from the excluded files.
    const reportedFiles = result.value.classes.flatMap((c) => c.members.map((m) => m.file));
    for (const excluded of [...CLASS_C_MEMBERS, 'src/unique.ts']) {
      expect(reportedFiles).not.toContain(excluded);
    }
  });

  it('drops the generated class when an exclude glob removes it', async () => {
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, {
      rootDir: PLANTED_ROOT,
      ignorePatterns: ['**/generated/**'],
    });
    if (!result.ok) throw new Error('expected ok');
    expect(memberSets(result.value.classes)).toEqual([CLASS_A_MEMBERS.join(',')]);
    expect(result.value.stats.filesScanned).toBe(9);
  });

  it('surfaces Class B once minInstances drops to 2', async () => {
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, {
      rootDir: PLANTED_ROOT,
      ignorePatterns: [],
      minInstances: 2,
    });
    if (!result.ok) throw new Error('expected ok');
    expect(memberSets(result.value.classes)).toContain(CLASS_B_MEMBERS.join(','));
    expect(result.value.stats.classesSuppressed).toBe(0);
  });

  it('surfaces Class C once minTokens drops below its measured size', async () => {
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, {
      rootDir: PLANTED_ROOT,
      ignorePatterns: [],
      minTokens: 10,
    });
    if (!result.ok) throw new Error('expected ok');
    expect(memberSets(result.value.classes)).toContain(CLASS_C_MEMBERS.join(','));
    // Lowering the bar below every unit's size empties unitsBelowMinTokens and
    // lets all 12 units be fingerprinted.
    expect(result.value.stats.unitsBelowMinTokens).toBe(0);
    expect(result.value.stats.unitsFingerprinted).toBe(TOTAL_UNITS);
  });

  it('reports the top class by priority and truncates the rest under maxClasses', async () => {
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, {
      rootDir: PLANTED_ROOT,
      ignorePatterns: [],
      maxClasses: 1,
    });
    if (!result.ok) throw new Error('expected ok');
    // Class D (87 tokens x 3 = 261) outranks Class A (83 x 3 = 249).
    expect(memberSets(result.value.classes)).toEqual([CLASS_D_MEMBERS.join(',')]);
    expect(result.value.stats.classesTruncated).toBe(1);
  });

  it('records member paths POSIX-relative to the supplied rootDir, not to this repo', async () => {
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    // `Ok` with `classes: []` is a deliberate reachable state, so the loop
    // below would otherwise pass with zero assertions executed.
    expect(result.value.classes).toHaveLength(2);
    for (const cls of result.value.classes) {
      for (const member of cls.members) {
        expect(member.file).not.toContain('\\');
        expect(member.file.startsWith('src/')).toBe(true);
        expect(member.file).not.toContain('packages/core');
      }
    }
  });

  it('labels every Phase-1 class as a plain duplicate with no sharedImport', async () => {
    const files = await discover(PLANTED_ROOT);
    const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.classes).toHaveLength(2);
    for (const cls of result.value.classes) {
      expect(cls.signal).toBe('duplicate');
      expect(cls.sharedImport).toBeUndefined();
    }
  });

  it('drops the markdown file without counting it as scanned or skipped', async () => {
    const files = await discover(PLANTED_ROOT);
    expect(files.some((f) => f.endsWith('notes.md'))).toBe(true);
    const result = await buildCloneIndex(files, { rootDir: PLANTED_ROOT, ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    const tsFiles = files.filter((f) => !f.endsWith('.md'));
    expect(result.value.stats.filesScanned).toBe(tsFiles.length);
    expect(result.value.stats.filesSkipped).toBe(0);
  });

  it('returns Err rather than an empty index when the default ignorePatterns hide the fixture', async () => {
    // The trap this fixture is most likely to spring: DEFAULT_DUPLICATION_CONFIG
    // ignores **/fixtures/** and **/tests/**, so a caller that resolves paths
    // against the REPO root and keeps the defaults discovers nothing. That must
    // read as a configuration error, not as "no duplication here".
    const files = await discover(PLANTED_ROOT);
    const repoRoot = join(__dirname, '../../../..');
    const result = await buildCloneIndex(files, { rootDir: repoRoot });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_CONFIG');
    expect(result.error.message).toMatch(/zero source files/i);
  });
});

describe('nesting semantics over the nested-units fixture', () => {
  it('reports the class-level and method-level groups as separate classes', async () => {
    const files = await discover(NESTED_ROOT, '**/*.ts');
    const result = await buildCloneIndex(files, { rootDir: NESTED_ROOT, ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    const kinds = result.value.classes.map((c) => c.members[0]!.kind).sort();
    expect(kinds).toEqual(['class', 'method']);
    // The class group outranks the method group: more tokens, same member count.
    expect(result.value.classes[0]!.members[0]!.kind).toBe('class');
  });

  it('emits no duplicate anonymous function unit for the methods', async () => {
    const files = await discover(NESTED_ROOT, '**/*.ts');
    const result = await buildCloneIndex(files, { rootDir: NESTED_ROOT, ignorePatterns: [] });
    if (!result.ok) throw new Error('expected ok');
    const names = result.value.classes.flatMap((c) => c.members.map((m) => m.unit));
    expect(names).not.toContain('<anon>');
    // Two units per file, not three: 3 files x (class + method) = 6.
    expect(result.value.stats.unitsFingerprinted).toBe(6);
    expect(result.value.stats.unitsBelowMinTokens).toBe(0);
  });
});
