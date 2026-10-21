import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { buildCloneIndex } from '../../src/duplication/index';
import type { CloneIndex, BuildCloneIndexOptions } from '../../src/duplication/index';

/**
 * Write `files` (repo-relative path -> source) into a fresh temp root and build
 * the index over exactly those paths.
 *
 * `order` lets a case drive the SAME file set in a different sequence, which is
 * what the determinism assertions need.
 */
async function scratch(
  files: Record<string, string>,
  options: BuildCloneIndexOptions = {},
  order: 'given' | 'reversed' = 'given'
): Promise<{ root: string; index: CloneIndex }> {
  const root = await mkdtemp(join(tmpdir(), 'dup-pe-'));
  for (const [rel, src] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), src, 'utf8');
  }
  const paths = Object.keys(files).map((f) => join(root, f));
  const result = await buildCloneIndex(order === 'reversed' ? paths.reverse() : paths, {
    rootDir: root,
    ignorePatterns: [],
    ...options,
  });
  if (!result.ok) throw new Error(`expected ok: ${result.error.message}`);
  return { root, index: result.value };
}

const shared = `export function extract(raw: string): string {\n  return raw.trim();\n}\n`;

/**
 * A >=40-token Type-2 clone body that CALLS the imported `extract`.
 *
 * `spec` is the import specifier, deliberately different per call site: the
 * three wrappers below sit at three directory depths and so spell the same
 * module three different ways. That is the arm a raw-specifier implementation
 * fails, and the reason the fixture is not three siblings.
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

/** The same body shape, but the cloned unit never touches an import. */
const standalone = (fn: string, p: string, out: string) =>
  `export function ${fn}(${p}: string[]): string[] {\n` +
  `  const ${out}: string[] = [];\n` +
  `  for (const item of ${p}) {\n` +
  `    const value = item.toUpperCase();\n` +
  `    if (value.length > 0) {\n` +
  `      ${out}.push(value);\n` +
  `    }\n` +
  `  }\n` +
  `  return ${out};\n` +
  `}\n`;

const threeDepths = {
  'src/shared/extract.ts': shared,
  'src/beta.ts': wrapper('./shared/extract.js', 'keepBeta', 'rows', 'kept'),
  'src/wrappers/alpha.ts': wrapper('../shared/extract.js', 'keepAlpha', 'items', 'out'),
  'src/deep/nested/gamma.ts': wrapper('../../shared/extract.js', 'keepGamma', 'entries', 'acc'),
};

describe('buildCloneIndex — partial-extraction signal (criterion 3)', () => {
  it('labels the class and names the module across three import depths', async () => {
    const { root, index } = await scratch(threeDepths);
    try {
      expect(index.classes).toHaveLength(1);
      const cls = index.classes[0]!;
      expect(cls.members).toHaveLength(3);
      // Measured, not guessed: this body normalizes to 62 tokens.
      expect(cls.tokenCount).toBe(62);
      expect(cls.rank).toBe(186);
      expect(cls.signal).toBe('partial-extraction');
      expect(cls.sharedImport).toBe('src/shared/extract');
      // `./shared/extract.js`, `../shared/extract.js` and
      // `../../shared/extract.js` are three distinct strings. One key.
      expect(cls.members.map((m) => m.unit).sort()).toEqual(['keepAlpha', 'keepBeta', 'keepGamma']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('names the same module whatever order the files are discovered in', async () => {
    const forward = await scratch(threeDepths);
    const reversed = await scratch(threeDepths, {}, 'reversed');
    try {
      expect(reversed.index.classes).toHaveLength(1);
      expect(reversed.index.classes[0]!.sharedImport).toBe(forward.index.classes[0]!.sharedImport);
      expect(reversed.index.classes[0]!.signal).toBe('partial-extraction');
    } finally {
      await rm(forward.root, { recursive: true, force: true });
      await rm(reversed.root, { recursive: true, force: true });
    }
  });

  it('picks the lexicographically smallest key when two modules are shared', async () => {
    // Both modules are CALLED inside every member body, so the predicate holds
    // for both and the single `sharedImport` field must pick one by a stated
    // rule rather than by discovery order. `bounds` exports a function, not a
    // constant: a shared CONSTANT is exactly what the role filter rejects, so a
    // `LIMIT` here would make this a one-module case and the assertion vacuous.
    const twoShared = (spec: string, fn: string, p: string, out: string) =>
      `import { extract } from '${spec}/extract.js';\n` +
      `import { limit } from '${spec}/bounds.js';\n` +
      `export function ${fn}(${p}: string[]): string[] {\n` +
      `  const ${out}: string[] = [];\n` +
      `  for (const item of ${p}) {\n` +
      `    const value = extract(item);\n` +
      `    if (value.length > 0 && ${out}.length < limit()) {\n` +
      `      ${out}.push(value);\n` +
      `    }\n` +
      `  }\n` +
      `  return ${out};\n` +
      `}\n`;
    const { root, index } = await scratch({
      'src/shared/extract.ts': shared,
      'src/shared/bounds.ts': `export function limit(): number {\n  return 10;\n}\n`,
      'src/beta.ts': twoShared('./shared', 'keepBeta', 'rows', 'kept'),
      'src/wrappers/alpha.ts': twoShared('../shared', 'keepAlpha', 'items', 'out'),
      'src/deep/nested/gamma.ts': twoShared('../../shared', 'keepGamma', 'entries', 'acc'),
    });
    try {
      expect(index.classes).toHaveLength(1);
      // 'src/shared/bounds' < 'src/shared/extract'.
      expect(index.classes[0]!.sharedImport).toBe('src/shared/bounds');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/**
 * A `.tsx` component whose ONLY reference to the shared import is a JSX element.
 *
 * `n` names the variable holding the length: the length is computed BEFORE the
 * return rather than inline as `total={out.length}`, and that is not style.
 * Measured: inside a JSX expression container typescript-estree tokenizes a
 * DOTTED expression's parts as `JSXIdentifier` (`total={out.length}` yields
 * `JSXIdentifier "out"` and `JSXIdentifier "length"`, while `data={out}` and
 * `flag={out[0]}` yield plain `Identifier "out"`). `tokens.ts` keeps
 * `JSXIdentifier` verbatim on the argument that a TAG name is structural, so a
 * variable rename inside a dotted JSX attribute defeats Type-2 clustering — the
 * three panels below differed only in identifier names and produced three
 * fingerprints until the dotted form was lifted out.
 */
const jsxPanel = (spec: string, fn: string, p: string, out: string, n: string) =>
  `import { Row } from '${spec}';\n` +
  `export function ${fn}(${p}: string[]) {\n` +
  `  const ${out}: string[] = [];\n` +
  `  for (const item of ${p}) {\n` +
  `    const trimmed = item.trim();\n` +
  `    if (trimmed.length > 0) {\n` +
  `      ${out}.push(trimmed.toUpperCase());\n` +
  `    }\n` +
  `  }\n` +
  `  const ${n} = ${out}.length;\n` +
  `  return <Row data={${out}} total={${n}} />;\n` +
  `}\n`;

const rowComponent = `export function Row(props: { data: string[] }) {\n  return props.data.length;\n}\n`;

const jsxPanels = (ext: 'tsx' | 'ts') => ({
  [`src/shared/row.${ext}`]: rowComponent,
  [`src/beta.${ext}`]: jsxPanel('./shared/row.js', 'PanelBeta', 'rows', 'kept', 'size'),
  [`src/views/alpha.${ext}`]: jsxPanel('../shared/row.js', 'PanelAlpha', 'items', 'out', 'count'),
  [`src/views/deep/gamma.${ext}`]: jsxPanel(
    '../../shared/row.js',
    'PanelGamma',
    'entries',
    'acc',
    'tally'
  ),
});

describe('buildCloneIndex — a JSX element name is a qualifying use (criterion 3)', () => {
  it('labels three .tsx wrappers whose only reference to the import is <Row />', async () => {
    // The JSX arm had NO coverage in a detector that deliberately parses JSX:
    // dropping it survived all 509 tests, and no duplication fixture anywhere
    // in this feature used `.tsx` or `.jsx`. Here the import appears in exactly
    // one place in each body — as an element name — so the label can only have
    // come from that arm.
    const { root, index } = await scratch(jsxPanels('tsx'));
    try {
      expect(index.stats.filesScanned).toBe(4);
      expect(index.stats.filesSkipped).toBe(0);
      expect(index.classes).toHaveLength(1);
      const cls = index.classes[0]!;
      expect(cls.members).toHaveLength(3);
      expect(cls.tokenCount).toBe(83);
      expect(cls.signal).toBe('partial-extraction');
      expect(cls.sharedImport).toBe('src/shared/row');
      expect(cls.members.map((m) => m.file)).toEqual([
        'src/beta.tsx',
        'src/views/alpha.tsx',
        'src/views/deep/gamma.tsx',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips the SAME sources named .ts, because TypeScript forbids JSX there', async () => {
    // The other half of why the arm is load-bearing: `jsx: true` is enabled by
    // extension (`isJsxCapable`), and `.ts` is excluded because `<T>x` is a type
    // assertion there. So these three panels do not parse at all — which is the
    // correct outcome, and it is asserted rather than assumed.
    const { root, index } = await scratch(jsxPanels('ts'));
    try {
      expect(index.stats.filesScanned).toBe(1);
      expect(index.stats.filesSkipped).toBe(3);
      expect(index.skipped.map((sk) => sk.reason)).toEqual([
        'unparseable',
        'unparseable',
        'unparseable',
      ]);
      expect(index.classes).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('buildCloneIndex — what does NOT get labelled (criterion 2)', () => {
  it('leaves a FILE-level-only common import as a plain duplicate', async () => {
    // Every file imports `extract` and every file REFERENCES it — but only
    // from a second, too-small-to-report function, never from the cloned body.
    // This is the single case that separates the shipped predicate from the
    // spec's original file-level wording.
    const sidecar = (spec: string, fn: string, p: string, out: string) =>
      `import { extract } from '${spec}';\n` +
      standalone(fn, p, out) +
      `export function label${fn}(raw: string): string {\n  return extract(raw);\n}\n`;
    const { root, index } = await scratch({
      'src/shared/extract.ts': shared,
      'src/beta.ts': sidecar('./shared/extract.js', 'keepBeta', 'rows', 'kept'),
      'src/wrappers/alpha.ts': sidecar('../shared/extract.js', 'keepAlpha', 'items', 'out'),
      'src/deep/nested/gamma.ts': sidecar('../../shared/extract.js', 'keepGamma', 'entries', 'acc'),
    });
    try {
      expect(index.classes).toHaveLength(1);
      const cls = index.classes[0]!;
      expect(cls.members).toHaveLength(3);
      expect(cls.signal).toBe('duplicate');
      expect(cls.sharedImport).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('leaves a common Node builtin as a plain duplicate, with sharedImport ABSENT', async () => {
    const viaBuiltin = (fn: string, p: string, out: string) =>
      `import { join } from 'node:path';\n` +
      `export function ${fn}(${p}: string[]): string[] {\n` +
      `  const ${out}: string[] = [];\n` +
      `  for (const item of ${p}) {\n` +
      `    const value = join(item, 'x');\n` +
      `    if (value.length > 0) {\n` +
      `      ${out}.push(value);\n` +
      `    }\n` +
      `  }\n` +
      `  return ${out};\n` +
      `}\n`;
    const { root, index } = await scratch({
      'src/beta.ts': viaBuiltin('keepBeta', 'rows', 'kept'),
      'src/wrappers/alpha.ts': viaBuiltin('keepAlpha', 'items', 'out'),
      'src/deep/nested/gamma.ts': viaBuiltin('keepGamma', 'entries', 'acc'),
    });
    try {
      expect(index.classes).toHaveLength(1);
      const cls = index.classes[0]!;
      expect(cls.signal).toBe('duplicate');
      // Absent, not present-and-undefined: `Object.keys` and the wire format
      // disagree about those two, and the barrel suite pins the key set.
      expect('sharedImport' in cls).toBe(false);
      expect(Object.keys(cls)).not.toContain('sharedImport');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('leaves a common TYPE-ONLY import as a plain duplicate', async () => {
    // A shared `import type` IS the "structurally forced by an interface
    // contract" false positive criterion 2 rejects.
    const viaType = (spec: string, fn: string, p: string, out: string) =>
      `import type { Shape } from '${spec}';\n` +
      `export function ${fn}(${p}: Shape[]): Shape[] {\n` +
      `  const ${out}: Shape[] = [];\n` +
      `  for (const item of ${p}) {\n` +
      `    const value = item;\n` +
      `    if (value.id.length > 0) {\n` +
      `      ${out}.push(value);\n` +
      `    }\n` +
      `  }\n` +
      `  return ${out};\n` +
      `}\n`;
    const { root, index } = await scratch({
      'src/shared/shape.ts': `export interface Shape {\n  id: string;\n}\n`,
      'src/beta.ts': viaType('./shared/shape.js', 'keepBeta', 'rows', 'kept'),
      'src/wrappers/alpha.ts': viaType('../shared/shape.js', 'keepAlpha', 'items', 'out'),
      'src/deep/nested/gamma.ts': viaType('../../shared/shape.js', 'keepGamma', 'entries', 'acc'),
    });
    try {
      expect(index.classes).toHaveLength(1);
      expect(index.classes[0]!.signal).toBe('duplicate');
      expect(index.classes[0]!.sharedImport).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('leaves a class whose members reference DIFFERENT modules as a plain duplicate', async () => {
    const { root, index } = await scratch({
      'src/shared/extract.ts': shared,
      'src/shared/other.ts': `export function extract(raw: string): string {\n  return raw;\n}\n`,
      'src/beta.ts': wrapper('./shared/extract.js', 'keepBeta', 'rows', 'kept'),
      'src/wrappers/alpha.ts': wrapper('../shared/extract.js', 'keepAlpha', 'items', 'out'),
      // Same body, same local binding name, DIFFERENT module.
      'src/deep/nested/gamma.ts': wrapper('../../shared/other.js', 'keepGamma', 'entries', 'acc'),
    });
    try {
      const cls = index.classes.find((c) => c.members.length === 3);
      expect(cls).toBeDefined();
      expect(cls!.signal).toBe('duplicate');
      expect(cls!.sharedImport).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/**
 * A >=40-token plain-duplicate body, LARGER than `wrapper` and referencing no
 * import at all.
 *
 * Sized on purpose: measured, `wrapper` is 62 tokens x 3 = rank 186 and this
 * one is 103 x 3 = rank 309, so `rank_PE < rank_plain < 2 x rank_PE`. That is
 * the only interval in which the ordering assertions below can distinguish
 * "sorted by priority" from "sorted by rank" — outside it both orderings agree
 * and the test would be vacuous.
 */
const bigPlain = (fn: string, p: string, out: string) =>
  `export function ${fn}(${p}: { cost: number; label: string }[]) {\n` +
  `  let ${out} = 0;\n` +
  `  const seen: string[] = [];\n` +
  `  const skipped: string[] = [];\n` +
  `  for (const row of ${p}) {\n` +
  `    if (row.cost > 0) {\n` +
  `      ${out} += row.cost;\n` +
  `      seen.push(row.label);\n` +
  `    } else {\n` +
  `      skipped.push(row.label);\n` +
  `    }\n` +
  `  }\n` +
  `  return { total: ${out}, labels: seen, skipped };\n` +
  `}\n`;

const mixed = {
  ...threeDepths,
  'src/plain/one.ts': bigPlain('sumOne', 'rows', 'total'),
  'src/plain/two.ts': bigPlain('sumTwo', 'entries', 'acc'),
  'src/plain/three.ts': bigPlain('sumThree', 'items', 'sum'),
};

describe('buildCloneIndex — priority ordering and the report cap (criterion 13)', () => {
  it('puts the SMALLER labelled class ahead of the larger plain duplicate', async () => {
    const { root, index } = await scratch(mixed);
    try {
      expect(index.classes).toHaveLength(2);
      const [first, second] = index.classes as [
        (typeof index.classes)[number],
        (typeof index.classes)[number],
      ];
      expect(first.signal).toBe('partial-extraction');
      expect(second.signal).toBe('duplicate');
      // The proof that `priority`, not `rank`, drives the order: the class in
      // front is the SMALLER one. Under rank-descending it would be second.
      expect(first.rank).toBe(186);
      expect(second.rank).toBe(309);
      expect(first.rank).toBeLessThan(second.rank);
      expect(first.priority).toBe(first.rank * 2);
      expect(first.priority).toBe(372);
      expect(second.priority).toBe(second.rank);
      expect(index.classes.map((c) => c.priority)).toEqual([372, 309]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps the labelled class when maxClasses drops the larger plain one', async () => {
    const { root, index } = await scratch(mixed, { maxClasses: 1 });
    try {
      expect(index.classes).toHaveLength(1);
      // Criterion 13 by `priority`: the survivor is the SMALLER class.
      expect(index.classes[0]!.signal).toBe('partial-extraction');
      expect(index.classes[0]!.rank).toBe(186);
      expect(index.stats.classesTruncated).toBe(1);
      expect(index.stats.classesReported).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('gives an AMBIGUOUS byMember key to the labelled class over a larger plain one', async () => {
    // The seam `code-craft` will bind to (`index.ts`'s byMember comment: "a
    // labelled class therefore wins such a key over a larger plain duplicate"),
    // and it was covered by nothing. The case this replaces drove `mixed`,
    // whose two classes live in DISJOINT files, so no `${file}:${startLine}`
    // key was ever ambiguous and first-writer-wins never fired: reversing the
    // ownership iteration left that file 11/11 green.
    //
    // Here the collision is real. Each `src/oN.ts` holds a one-line outer
    // function whose inline arrow begins on the same line, so the outer and the
    // arrow share the key `src/oN.ts:2`. The outer CALLS the shared helper
    // (outside the arrow) and is labelled; the arrow does not and is plain. The
    // arrow also appears standalone in three further files, which makes the
    // PLAIN class the larger of the two by rank — so only `priority` can put
    // the labelled class in front.
    const ARROW = (a: string, b: string) =>
      `(${a}) => { const ${b} = ${a}.length * 2; const q = ${b} + 1; ` +
      `const r = q * 3; const s = r - 4; const t = s / 5; const u = t + 6; ` +
      `return ${b} + q + r + s + t + u; }`;
    const outer = (fn: string, p: string, a: string, b: string) =>
      `import { extract } from './shared/extract.js';\n` +
      `export function ${fn}(${p}) { const seed = extract('x'); ` +
      `return ${p}.map(${ARROW(a, b)}).concat([seed.length]); }\n`;
    const hold = (nm: string, a: string, b: string) => `export const ${nm} = ${ARROW(a, b)};\n`;

    const { root, index } = await scratch({
      'src/shared/extract.ts': shared,
      'src/o1.ts': outer('outerOne', 'items', 'alpha', 'beta'),
      'src/o2.ts': outer('outerTwo', 'rows', 'gamma', 'delta'),
      'src/o3.ts': outer('outerThree', 'entries', 'epsilon', 'zeta'),
      'src/a1.ts': hold('holdOne', 'eta', 'theta'),
      'src/a2.ts': hold('holdTwo', 'iota', 'kappa'),
      'src/a3.ts': hold('holdThree', 'lambda', 'mu'),
    });
    try {
      expect(index.classes).toHaveLength(2);
      const labelled = index.classes.find((c) => c.signal === 'partial-extraction')!;
      const plain = index.classes.find((c) => c.signal === 'duplicate')!;
      expect(labelled.sharedImport).toBe('src/shared/extract');

      // The plain class is the LARGER one by rank, and still loses the key.
      expect(labelled.rank).toBe(282);
      expect(plain.rank).toBe(378);
      expect(plain.rank).toBeGreaterThan(labelled.rank);
      expect(labelled.priority).toBe(564);
      expect(plain.priority).toBe(378);

      // The collision is real: nine members, six keys.
      expect(labelled.members.length + plain.members.length).toBe(9);
      expect(index.byMember.size).toBe(6);
      const contested = ['src/o1.ts:2', 'src/o2.ts:2', 'src/o3.ts:2'];
      for (const key of contested) {
        // Both classes have a member at this key...
        expect(labelled.members.some((m) => `${m.file}:${m.startLine}` === key)).toBe(true);
        expect(plain.members.some((m) => `${m.file}:${m.startLine}` === key)).toBe(true);
        // ...and the labelled one owns it.
        expect(index.byMember.get(key)).toBe(labelled);
      }
      // The plain class still owns the three keys nobody contests.
      for (const key of ['src/a1.ts:1', 'src/a2.ts:1', 'src/a3.ts:1']) {
        expect(index.byMember.get(key)).toBe(plain);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('puts the labelled class first when a labelled rank r TIES a plain rank 2r', async () => {
    // The tie family the boost creates, and the one place D8's ordering
    // sentence has to hold on its own: `priority` cannot separate these two, so
    // without a `signal` term the published order came from sha1 hex.
    //
    // Sized and SHAPED so the case cannot be vacuous. The plain body's
    // statement mix is chosen (not guessed) to land on exactly 93 normalized
    // tokens AND to digest BELOW the wrapper's — so the pre-existing
    // `fingerprint` tiebreak, left to itself, would put the plain class first.
    // The assertions below prove that adversity rather than assuming it.
    const tiedPlain = (fn: string, p: string, out: string) =>
      `export function ${fn}(${p}: { cost: number }[]) {\n` +
      `  let ${out} = 0;\n` +
      `  const k0 = ${out} + 0;\n  ${out} += k0;\n` +
      `  const k1 = ${out} + 1;\n  ${out} += k1;\n` +
      `  if (${out} > 2) {\n    ${out} -= 2;\n  }\n` +
      `  if (${out} > 3) {\n    ${out} -= 3;\n  }\n` +
      `  ${out} += Math.abs(${out});\n` +
      `  for (const row of ${p}) {\n    ${out} += row.cost;\n  }\n` +
      `  return ${out};\n}\n`;
    const { root, index } = await scratch({
      ...threeDepths,
      'src/tied/one.ts': tiedPlain('sumOne', 'rowsOne', 'accOne'),
      'src/tied/two.ts': tiedPlain('sumTwo', 'rowsTwo', 'accTwo'),
      'src/tied/three.ts': tiedPlain('sumThree', 'rowsThree', 'accThree'),
      'src/tied/four.ts': tiedPlain('sumFour', 'rowsFour', 'accFour'),
    });
    try {
      expect(index.classes).toHaveLength(2);
      const [first, second] = index.classes as [
        (typeof index.classes)[number],
        (typeof index.classes)[number],
      ];
      // The tie is REAL: 62 x 3 x 2 === 93 x 4.
      expect(first.priority).toBe(372);
      expect(second.priority).toBe(372);
      expect([first.rank, second.rank]).toEqual([186, 372]);
      // And ADVERSE: by fingerprint alone the plain class would lead.
      expect(first.fingerprint.localeCompare(second.fingerprint)).toBeGreaterThan(0);
      // So the order below can only have come from `signal`.
      expect(first.signal).toBe('partial-extraction');
      expect(second.signal).toBe('duplicate');
      expect(first.rank).toBeLessThan(second.rank);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('gives every plain duplicate priority === rank, so no-label projects are unchanged', async () => {
    const { root, index } = await scratch({
      'src/plain/one.ts': bigPlain('sumOne', 'rows', 'total'),
      'src/plain/two.ts': bigPlain('sumTwo', 'entries', 'acc'),
      'src/plain/three.ts': bigPlain('sumThree', 'items', 'sum'),
    });
    try {
      expect(index.classes).toHaveLength(1);
      for (const cls of index.classes) {
        expect(cls.signal).toBe('duplicate');
        expect(cls.priority).toBe(cls.rank);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
