import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as core from '@harness-engineering/core';
import { buildCloneIndex, DEFAULT_DUPLICATION_CONFIG } from '@harness-engineering/core';
import type {
  CloneIndex,
  CloneClass,
  CloneMember,
  CloneUnitKind,
  DuplicationConfig,
  SkippedFile,
} from '@harness-engineering/core';

// Criterion 11 says "importable from `@harness-engineering/core`", so this suite
// imports the PACKAGE SPECIFIER, not `../../src/index`. The source barrel would stay
// green through a tsup/export regression that dropped the module from `dist`.
//
// Every assertion here is over an object PRODUCTION code built. An earlier
// revision asserted `Object.keys()` over object literals the test itself had
// typed four lines earlier, which only proved the author wrote four keys, and
// the types do not rescue it: `packages/core/tsconfig.json` excludes `tests`
// and `vitest.config.mts` has no `typecheck` block, so a type-only import is
// never checked by anything. (That gap is filed as roadmap row
// `typecheck-test-files`.)

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

let root: string;
let index: CloneIndex;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dup-barrel-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'a.ts'), body('sumAlpha', 'items', 'total', 'item'), 'utf8');
  await writeFile(join(root, 'src', 'b.ts'), body('addBeta', 'rows', 'acc', 'row'), 'utf8');
  await writeFile(join(root, 'src', 'c.ts'), body('tallyGamma', 'entries', 'sum', 'entry'), 'utf8');
  // Eligible but unreadable, so `skipped` is populated rather than empty.
  const result = await buildCloneIndex(
    ['a.ts', 'b.ts', 'c.ts', 'absent.ts'].map((f) => join(root, 'src', f)),
    { rootDir: root, ignorePatterns: [] }
  );
  if (!result.ok) throw new Error(`expected ok: ${result.error.message}`);
  index = result.value;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('core barrel — duplication surface (criterion 11)', () => {
  it.each([
    'buildCloneIndex',
    'fingerprintFile',
    'isEligibleFile',
    'resolveDuplicationConfig',
    'extractUnits',
    'normalizeTokens',
    'fingerprintStream',
    'MissingNodeLocationError',
    'DEFAULT_DUPLICATION_CONFIG',
    'MAX_EVIDENCE_ENTRIES',
    'IDENTIFIER_PLACEHOLDER',
    'LITERAL_PLACEHOLDER',
    // Phase 4, criterion 11 extended.
    'moduleKey',
    'collectFileImports',
    'usedImportKeys',
    'sharedImportKey',
  ])('exposes %s as a named export on the package entry point', (name) => {
    // What this proves: the name is present on the package's namespace object.
    // It does NOT prove the binding is usable — the case below does that for
    // `buildCloneIndex`, and every other case in this file exercises the
    // objects production built.
    expect(core).toHaveProperty(name);
  });

  it('re-exports buildCloneIndex as a working function, not merely a binding', () => {
    expect(typeof buildCloneIndex).toBe('function');
    expect(DEFAULT_DUPLICATION_CONFIG.minInstances).toBe(3);
  });

  it('ships a DEFAULT_DUPLICATION_CONFIG carrying exactly the four specified fields', () => {
    // Asserted over the shipped default, not over a literal this test wrote —
    // and titled for what that proves: the shipped OBJECT's keys, not the
    // interface's. A fifth OPTIONAL field on `DuplicationConfig` would leave
    // this green, since nothing would have to set it.
    expect(Object.keys(DEFAULT_DUPLICATION_CONFIG).sort()).toEqual([
      'ignorePatterns',
      'maxClasses',
      'minInstances',
      'minTokens',
    ]);
    const config: DuplicationConfig = DEFAULT_DUPLICATION_CONFIG;
    expect(typeof config.minTokens).toBe('number');
  });

  it('builds a CloneIndex with exactly the specified top-level and stats fields', () => {
    expect(Object.keys(index).sort()).toEqual([
      'byMember',
      'classes',
      'collisions',
      'skipped',
      'stats',
    ]);
    expect(Object.keys(index.stats).sort()).toEqual([
      'classesReported',
      'classesSuppressed',
      'classesTruncated',
      'collisionsObserved',
      'collisionsTruncated',
      'filesIgnored',
      'filesScanned',
      'filesSkipped',
      'skippedTruncated',
      'unitsBelowMinTokens',
      'unitsFingerprinted',
    ]);
    expect(index.byMember).toBeInstanceOf(Map);
  });

  it('builds a CloneClass and CloneMember matching the exported interfaces', () => {
    expect(index.classes).toHaveLength(1);
    const cls: CloneClass = index.classes[0]!;
    // `sharedImport` is unset in Phase 1, so it is absent from the built object.
    expect(Object.keys(cls).sort()).toEqual([
      'fingerprint',
      'members',
      'rank',
      'signal',
      'tokenCount',
    ]);
    expect(cls.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(cls.signal).toBe('duplicate');

    expect(cls.members).toHaveLength(3);
    const member: CloneMember = cls.members[0]!;
    expect(Object.keys(member).sort()).toEqual(['endLine', 'file', 'kind', 'startLine', 'unit']);
    const kind: CloneUnitKind = member.kind;
    expect(['function', 'method', 'class']).toContain(kind);
    expect(index.byMember.get(`${member.file}:${member.startLine}`)).toBe(cls);
  });

  it('builds a SkippedFile matching the exported interface', () => {
    expect(index.skipped).toHaveLength(1);
    const skip: SkippedFile = index.skipped[0]!;
    expect(Object.keys(skip).sort()).toEqual([
      'errorName',
      'file',
      'message',
      'originalError',
      'reason',
    ]);
    expect(skip.reason).toBe('unreadable');
    expect(skip.originalError).toBeInstanceOf(Error);
  });
});
