import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_DUPLICATION_CONFIG,
  resolveDuplicationConfig,
  isEligibleFile,
  buildCloneIndex,
} from '../../src/duplication/index';

describe('resolveDuplicationConfig', () => {
  it('applies the Rule-of-Three defaults', () => {
    expect(DEFAULT_DUPLICATION_CONFIG.minTokens).toBe(40);
    expect(DEFAULT_DUPLICATION_CONFIG.minInstances).toBe(3);
    expect(DEFAULT_DUPLICATION_CONFIG.maxClasses).toBe(100);
  });

  it('returns the defaults when given nothing', () => {
    expect(resolveDuplicationConfig()).toEqual(DEFAULT_DUPLICATION_CONFIG);
  });

  it('overrides only the supplied fields', () => {
    const resolved = resolveDuplicationConfig({ minInstances: 2 });
    expect(resolved.minInstances).toBe(2);
    expect(resolved.minTokens).toBe(DEFAULT_DUPLICATION_CONFIG.minTokens);
  });

  it('honours an explicitly empty ignorePatterns rather than falling back to defaults', () => {
    expect(resolveDuplicationConfig({ ignorePatterns: [] }).ignorePatterns).toEqual([]);
  });

  it('does not share one ignorePatterns array across resolved configs', () => {
    // DEFAULT_DUPLICATION_CONFIG is a public export, so a consumer mutating a
    // resolved config must not reach the defaults or any other caller.
    const a = resolveDuplicationConfig();
    const b = resolveDuplicationConfig();
    expect(a.ignorePatterns).not.toBe(b.ignorePatterns);
    expect(a.ignorePatterns).not.toBe(DEFAULT_DUPLICATION_CONFIG.ignorePatterns);
    const before = DEFAULT_DUPLICATION_CONFIG.ignorePatterns.length;
    a.ignorePatterns.push('**/leaked/**');
    expect(b.ignorePatterns).not.toContain('**/leaked/**');
    expect(DEFAULT_DUPLICATION_CONFIG.ignorePatterns).toHaveLength(before);
    expect(resolveDuplicationConfig().ignorePatterns).not.toContain('**/leaked/**');
  });
});

describe('isEligibleFile', () => {
  const noIgnore = { ignorePatterns: [] as string[] };

  it.each(['a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs'])(
    'accepts the supported extension %s',
    (file) => {
      expect(isEligibleFile(file, noIgnore.ignorePatterns)).toBe(true);
    }
  );

  it.each(['a.py', 'a.go', 'a.md', 'a.json', 'a.d.ts'])('rejects %s', (file) => {
    expect(isEligibleFile(file, noIgnore.ignorePatterns)).toBe(false);
  });

  it.each(['A.TS', 'src/Foo.TSX', 'src/a.Js', 'src/a.MJS'])(
    'accepts %s — extension matching is case-insensitive',
    (file) => {
      // A real Foo.TS exists on case-insensitive macOS/Windows filesystems;
      // rejecting on case alone made it appear in neither filesScanned nor
      // filesSkipped.
      expect(isEligibleFile(file, noIgnore.ignorePatterns)).toBe(true);
    }
  );

  it.each(['src/a.D.TS', 'src/types.d.TS'])('still rejects %s regardless of case', (file) => {
    expect(isEligibleFile(file, noIgnore.ignorePatterns)).toBe(false);
  });

  it.each(['../../x/index.ts', '../sibling/src/a.ts', '..'])(
    'rejects %s — a path outside rootDir bypasses every **-anchored ignore glob',
    (file) => {
      expect(isEligibleFile(file, DEFAULT_DUPLICATION_CONFIG.ignorePatterns)).toBe(false);
      expect(isEligibleFile(file, noIgnore.ignorePatterns)).toBe(false);
    }
  );

  it('rejects an escaping path that an ignore glob would have matched in-tree', () => {
    const ignore = DEFAULT_DUPLICATION_CONFIG.ignorePatterns;
    // The asymmetry this closes: in-tree the glob applies, out-of-tree it did not.
    expect(isEligibleFile('tests/a.ts', ignore)).toBe(false);
    expect(isEligibleFile('../../pkg/tests/a.ts', ignore)).toBe(false);
  });

  it('rejects a file matched by an ignore pattern', () => {
    expect(isEligibleFile('src/generated/gen.ts', ['**/generated/**'])).toBe(false);
  });

  it('rejects test and fixture files under the defaults', () => {
    const ignore = DEFAULT_DUPLICATION_CONFIG.ignorePatterns;
    expect(isEligibleFile('src/a.test.ts', ignore)).toBe(false);
    expect(isEligibleFile('tests/fixtures/x/src/a.ts', ignore)).toBe(false);
    expect(isEligibleFile('src/service.ts', ignore)).toBe(true);
  });

  it.each([
    'src/index.ts',
    'packages/cli/src/api-craft/index.ts',
    'src/index.js',
    'src/index.mjs',
    'src/index.cjs',
  ])(
    'accepts %s under the defaults — index.* is an implementation module, not a barrel',
    (file) => {
      // A true barrel is pure re-exports and yields no units at all, so ignoring
      // it bought nothing; in this repo the glob instead suppressed 10 of 58
      // classes, `sumCosts` x10 among them.
      expect(isEligibleFile(file, DEFAULT_DUPLICATION_CONFIG.ignorePatterns)).toBe(true);
    }
  );

  it.each([
    'node_modules/pkg/a.js',
    'packages/core/node_modules/pkg/a.js',
    'dist/a.js',
    'packages/core/dist/index.js',
    'build/a.js',
    'coverage/a.js',
  ])('rejects build output and installed dependencies under the defaults (%s)', (file) => {
    expect(isEligibleFile(file, DEFAULT_DUPLICATION_CONFIG.ignorePatterns)).toBe(false);
  });
});

/** A >=40-token body parameterised only by identifier names (Type-2 clone). */
const body = (fn: string, p: string, acc: string, el: string) =>
  `export function ${fn}(${p}: { cost: number; label: string }[]) {\n` +
  `  let ${acc} = 0;\n` +
  `  const seen: string[] = [];\n` +
  `  for (const ${el} of ${p}) {\n` +
  `    if (${el}.cost > 0) {\n` +
  `      ${acc} += ${el}.cost;\n` +
  `      seen.push(${el}.label);\n` +
  `    }\n` +
  `  }\n` +
  `  return { total: ${acc}, labels: seen };\n` +
  `}\n`;

/**
 * A second, STRUCTURALLY distinct >=40-token body (`while`/`pop`/`break`
 * instead of `for…of`/`if`). Varying only literals or member names would NOT
 * produce a second fingerprint — see the "near miss" note in the fixture README.
 */
const bodyB = (fn: string, p: string, acc: string, el: string) =>
  `export function ${fn}(${p}: Record<string, number>): string[] {\n` +
  `  const ${acc}: string[] = [];\n` +
  `  const keys = Object.keys(${p});\n` +
  `  while (keys.length > 0) {\n` +
  `    const ${el} = keys.pop();\n` +
  `    if (${el} === undefined) {\n` +
  `      break;\n` +
  `    }\n` +
  `    ${acc}.push(${el} + '=' + String(${p}[${el}]));\n` +
  `  }\n` +
  `  return ${acc};\n` +
  `}\n`;

/**
 * A ONE-LINE outer function whose inline arrow begins on the same line, so the
 * outer and the arrow both key to `${file}:1` in `byMember` — the ambiguity the
 * spec names as a known risk. Both bodies clear `minTokens` on their own.
 */
const collide = (fn: string, p: string, a: string, b: string) =>
  `export function ${fn}(${p}) { return ${p}.map((${a}) => { const ${b} = ${a} * 2; const q = ${b} + 1; const r = q * 3; const s = r - 4; const t = s / 5; const u = t + 6; return ${b} + q + r + s + t + u; }); }\n`;

async function scratch(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dup-idx-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content, 'utf8');
  }
  return root;
}

describe('buildCloneIndex', () => {
  it('refuses a file set that lies outside rootDir rather than reporting it unfiltered', async () => {
    const root = await scratch({
      'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
      'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
      'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
    });
    try {
      // rootDir deeper than the files: every relative path is `../`-prefixed,
      // which no `**`-anchored ignore glob matches.
      const result = await buildCloneIndex(
        ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f)),
        { rootDir: join(root, 'src', 'nested', 'deeper') }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details.reason).toBe('zero-files-discovered');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('groups three Type-2 clones into one class and reports stats', async () => {
    const root = await scratch({
      'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
      'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
      'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
    });
    try {
      const result = await buildCloneIndex(
        ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f)),
        { rootDir: root, ignorePatterns: [] }
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const index = result.value;
      expect(index.classes.map((c) => c.members.length)).toEqual([3]);
      expect(index.classes[0]!.members.map((m) => m.file)).toEqual([
        'src/a.ts',
        'src/b.ts',
        'src/c.ts',
      ]);
      expect(index.classes[0]!.signal).toBe('duplicate');
      expect(index.classes[0]!.sharedImport).toBeUndefined();
      expect(index.classes[0]!.rank).toBe(
        index.classes[0]!.tokenCount * index.classes[0]!.members.length
      );
      expect(index.stats.filesScanned).toBe(3);
      expect(index.stats.filesSkipped).toBe(0);
      expect(index.stats.classesReported).toBe(index.classes.length);
      expect(index.stats.unitsFingerprinted).toBe(3);
      expect(index.stats.unitsBelowMinTokens).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('suppresses a two-member group under the default minInstances of 3', async () => {
    const root = await scratch({
      'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
      'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
    });
    try {
      const result = await buildCloneIndex([join(root, 'src/a.ts'), join(root, 'src/b.ts')], {
        rootDir: root,
        ignorePatterns: [],
      });
      if (!result.ok) throw new Error('expected ok');
      expect(result.value.classes).toEqual([]);
      expect(result.value.stats.classesSuppressed).toBe(1);
      expect(result.value.stats.unitsBelowMinTokens).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('excludes sub-minTokens units before grouping, so no class ever forms', async () => {
    // The amended spec applies minTokens at UNIT level before grouping. Three
    // identical tiny functions therefore produce three excluded units and NO
    // group at all — so classesSuppressed stays 0, because that counter is only
    // for classes that formed and were then dropped.
    const tiny = (n: string) => `export function ${n}(a: number) {\n  return a + 1;\n}\n`;
    const root = await scratch({
      'src/a.ts': tiny('one'),
      'src/b.ts': tiny('two'),
      'src/c.ts': tiny('three'),
    });
    try {
      const result = await buildCloneIndex(
        ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f)),
        { rootDir: root, ignorePatterns: [] }
      );
      if (!result.ok) throw new Error('expected ok');
      expect(result.value.classes).toEqual([]);
      expect(result.value.stats.unitsBelowMinTokens).toBe(3);
      expect(result.value.stats.unitsFingerprinted).toBe(0);
      expect(result.value.stats.classesSuppressed).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports the same units once minTokens drops below their size', async () => {
    // The mirror of the case above: the units are unchanged, only the bar moves,
    // which proves the exclusion is driven by minTokens and not by the shape.
    const tiny = (n: string) => `export function ${n}(a: number) {\n  return a + 1;\n}\n`;
    const root = await scratch({
      'src/a.ts': tiny('one'),
      'src/b.ts': tiny('two'),
      'src/c.ts': tiny('three'),
    });
    try {
      const result = await buildCloneIndex(
        ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f)),
        { rootDir: root, ignorePatterns: [], minTokens: 1 }
      );
      if (!result.ok) throw new Error('expected ok');
      expect(result.value.classes.map((c) => c.members.length)).toEqual([3]);
      expect(result.value.stats.unitsBelowMinTokens).toBe(0);
      expect(result.value.stats.unitsFingerprinted).toBe(3);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('counts a singleton group in neither classes nor classesSuppressed', async () => {
    const root = await scratch({ 'src/a.ts': body('sumAlpha', 'items', 'total', 'item') });
    try {
      const result = await buildCloneIndex([join(root, 'src/a.ts')], {
        rootDir: root,
        ignorePatterns: [],
      });
      if (!result.ok) throw new Error('expected ok');
      expect(result.value.classes).toEqual([]);
      expect(result.value.stats.classesSuppressed).toBe(0);
      expect(result.value.stats.unitsFingerprinted).toBe(1);
      expect(result.value.stats.unitsBelowMinTokens).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('caps at maxClasses by rank and records the dropped count', async () => {
    // Two STRUCTURALLY distinct bodies. `bodyB` must differ in keywords and
    // punctuators, not merely in literals or member names — those normalize
    // to `L` / `I` and would collapse both groups into one fingerprint.
    const root = await scratch({
      'src/a1.ts': body('sumAlpha', 'items', 'total', 'item'),
      'src/a2.ts': body('addBeta', 'rows', 'acc', 'row'),
      'src/a3.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
      'src/b1.ts': bodyB('pickOne', 'table', 'out', 'key'),
      'src/b2.ts': bodyB('pickTwo', 'lookup', 'list', 'name'),
      'src/b3.ts': bodyB('pickThree', 'map', 'acc', 'field'),
    });
    try {
      const abs = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map((f) => join(root, `src/${f}.ts`));
      const uncapped = await buildCloneIndex(abs, { rootDir: root, ignorePatterns: [] });
      if (!uncapped.ok) throw new Error('expected ok');
      const allRanks = uncapped.value.classes.map((c) => c.rank);
      expect(allRanks).toEqual([...allRanks].sort((x, y) => y - x));
      expect(uncapped.value.stats.classesReported).toBe(2);

      const capped = await buildCloneIndex(abs, {
        rootDir: root,
        ignorePatterns: [],
        maxClasses: 1,
      });
      if (!capped.ok) throw new Error('expected ok');
      expect(capped.value.stats.classesReported).toBe(1);
      expect(capped.value.stats.classesTruncated).toBe(allRanks.length - 1);
      expect(capped.value.classes.map((c) => c.rank)).toEqual([Math.max(...allRanks)]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('sorts classes rank-descending and deterministically', async () => {
    const root = await scratch({
      'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
      'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
      'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
    });
    try {
      const abs = ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f));
      const first = await buildCloneIndex(abs, { rootDir: root, ignorePatterns: [] });
      const second = await buildCloneIndex([...abs].reverse(), {
        rootDir: root,
        ignorePatterns: [],
      });
      if (!first.ok || !second.ok) throw new Error('expected ok');
      expect(second.value.classes.map((c) => c.fingerprint)).toEqual(
        first.value.classes.map((c) => c.fingerprint)
      );
      const ranks = first.value.classes.map((c) => c.rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('maps every member to its owning class by file:startLine', async () => {
    const root = await scratch({
      'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
      'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
      'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
    });
    try {
      const result = await buildCloneIndex(
        ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f)),
        { rootDir: root, ignorePatterns: [] }
      );
      if (!result.ok) throw new Error('expected ok');
      const index = result.value;
      // Pin the denominator: `Ok` with `classes: []` is reachable, and the loop
      // below would then pass without executing a single assertion.
      expect(index.classes).toHaveLength(1);
      expect(index.byMember.size).toBe(3);
      for (const cls of index.classes) {
        for (const member of cls.members) {
          expect(index.byMember.get(`${member.file}:${member.startLine}`)).toBe(cls);
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('resolves a real byMember collision to the higher-ranked class', async () => {
    const root = await scratch({
      'src/x1.ts': collide('outerOne', 'items', 'alpha', 'beta'),
      'src/x2.ts': collide('outerTwo', 'rows', 'gamma', 'delta'),
      'src/x3.ts': collide('outerThree', 'entries', 'epsilon', 'zeta'),
    });
    try {
      const result = await buildCloneIndex(
        ['src/x1.ts', 'src/x2.ts', 'src/x3.ts'].map((f) => join(root, f)),
        { rootDir: root, ignorePatterns: [] }
      );
      if (!result.ok) throw new Error('expected ok');
      const index = result.value;

      // Two classes form — the outer functions and the inline arrows — and every
      // member of both sits on line 1, so the keys genuinely collide.
      expect(index.classes).toHaveLength(2);
      expect(index.classes.flatMap((c) => c.members).map((m) => m.startLine)).toEqual([
        1, 1, 1, 1, 1, 1,
      ]);

      // Six members collapse onto three keys — that IS the collision.
      expect(index.byMember.size).toBe(3);

      const [higher, lower] = [...index.classes].sort((a, b) => b.rank - a.rank);
      expect(higher.rank).toBeGreaterThan(lower.rank);
      for (const member of higher.members) {
        expect(index.byMember.get(`${member.file}:${member.startLine}`)).toBe(higher);
      }
      // The lower-ranked class owns no key, despite having members.
      expect(lower.members.length).toBeGreaterThan(0);
      for (const member of lower.members) {
        expect(index.byMember.get(`${member.file}:${member.startLine}`)).not.toBe(lower);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips an ineligible extension without counting it as scanned or skipped', async () => {
    const root = await scratch({
      'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
      'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
      'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
      'src/notes.md': '# not source\n',
    });
    try {
      const result = await buildCloneIndex(
        ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/notes.md'].map((f) => join(root, f)),
        { rootDir: root, ignorePatterns: [] }
      );
      if (!result.ok) throw new Error('expected ok');
      expect(result.value.stats.filesScanned).toBe(3);
      expect(result.value.stats.filesSkipped).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('counts an unreadable listed file in filesSkipped and still completes', async () => {
    const root = await scratch({
      'src/a.ts': body('sumAlpha', 'items', 'total', 'item'),
      'src/b.ts': body('addBeta', 'rows', 'acc', 'row'),
      'src/c.ts': body('tallyGamma', 'entries', 'sum', 'entry'),
    });
    try {
      const result = await buildCloneIndex(
        ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/absent.ts'].map((f) => join(root, f)),
        { rootDir: root, ignorePatterns: [] }
      );
      if (!result.ok) throw new Error('expected ok');
      expect(result.value.stats.filesSkipped).toBe(1);
      expect(result.value.stats.classesReported).toBe(1);
      expect(result.value.skipped.map((entry) => [entry.file, entry.reason])).toEqual([
        ['src/absent.ts', 'unreadable'],
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
