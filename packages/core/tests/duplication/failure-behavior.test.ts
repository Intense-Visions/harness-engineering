import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fingerprintFile,
  buildCloneIndex,
  MAX_EVIDENCE_ENTRIES,
} from '../../src/duplication/index';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dup-fail-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'src', 'good.ts'),
    `export function ok(a: number) {\n  return a + 1;\n}\n`,
    'utf8'
  );
  await writeFile(join(root, 'src', 'broken.ts'), `export function broken( {\n`, 'utf8');
  // Two units in ONE file: the first calls the imported binding, the second
  // does not. Same file, same import list — so only a BODY-scoped derivation
  // can tell them apart.
  await writeFile(
    join(root, 'src', 'helper.ts'),
    `export function trim(raw: string) {\n  return raw.trim();\n}\n`,
    'utf8'
  );
  await writeFile(
    join(root, 'src', 'importer.ts'),
    `import { trim } from './helper.js';\n` +
      `export function usesImport(a: string) {\n  return trim(a);\n}\n` +
      `export function ignoresImport(b: string) {\n  return b + b;\n}\n`,
    'utf8'
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('fingerprintFile', () => {
  it('returns fingerprinted units for a readable, parseable file', async () => {
    const result = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts');
    expect(result.status).toBe('scanned');
    if (result.status !== 'scanned') return;
    expect(result.units.map((u) => u.member.unit)).toEqual(['ok']);
    expect(result.units[0]!.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(result.units[0]!.member.file).toBe('src/good.ts');
  });

  it('records only the imports each unit BODY references, per unit', async () => {
    const result = await fingerprintFile(join(root, 'src', 'importer.ts'), 'src/importer.ts');
    expect(result.status).toBe('scanned');
    if (result.status !== 'scanned') return;
    expect(result.units.map((u) => u.member.unit)).toEqual(['usesImport', 'ignoresImport']);
    expect(result.units[0]!.importKeys).toEqual(['src/helper']);
    // The decisive assertion: identical file, identical import list, empty.
    expect(result.units[1]!.importKeys).toEqual([]);
  });

  it('records an empty importKeys for a file with no first-party import', async () => {
    const result = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts');
    expect(result.status).toBe('scanned');
    if (result.status !== 'scanned') return;
    expect(result.units[0]!.importKeys).toEqual([]);
  });

  it('reports skipped for an unreadable file rather than throwing', async () => {
    const result = await fingerprintFile(join(root, 'src', 'absent.ts'), 'src/absent.ts');
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') return;
    expect(result.reason).toBe('unreadable');
  });

  it('reports skipped for an unparseable file rather than throwing', async () => {
    const result = await fingerprintFile(join(root, 'src', 'broken.ts'), 'src/broken.ts');
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') return;
    expect(result.reason).toBe('unparseable');
    expect(result.message.length).toBeGreaterThan(0);
    // The parser's own error class, carried rather than flattened to a string.
    expect(result.errorName.length).toBeGreaterThan(0);
    expect(result.originalError).toBeInstanceOf(Error);
    expect(result.originalError.message).toBe(result.message);
  });

  it('parses .tsx with the jsx option enabled', async () => {
    // Its own temp root: writing into the shared `root` left a file behind for
    // every later test, one `findFiles`-based test away from order dependence.
    const dir = await mkdtemp(join(tmpdir(), 'dup-tsx-'));
    try {
      const tsx = join(dir, 'view.tsx');
      await writeFile(
        tsx,
        `export function View() {\n  return <div className="a">hi</div>;\n}\n`,
        'utf8'
      );
      const result = await fingerprintFile(tsx, 'src/view.tsx');
      expect(result.status).toBe('scanned');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('parses JSX in .js, .mjs and .cjs rather than skipping it as unparseable', async () => {
    // Adopter portability, not a repo need. `SUPPORTED_EXTENSIONS` admits
    // `.js`/`.mjs`/`.cjs`, and in a CRA- or Next-style project JSX in `.js` is
    // the DEFAULT. With `jsx: false` every such component threw
    // `TSError: '>' expected`, so every one was skipped as `unparseable` with
    // the advice "check the file is valid TypeScript/JavaScript for its
    // extension" — the file is valid for its ecosystem; our parser flag was
    // wrong. A `src/` of such files then tripped the all-files-skipped `Err`
    // and the detector refused to run at all.
    const dir = await mkdtemp(join(tmpdir(), 'dup-jsx-js-'));
    try {
      const body = `export function View(props) {\n  return <div className="a">{props.hi}</div>;\n}\n`;
      for (const ext of ['js', 'mjs', 'cjs'] as const) {
        const file = join(dir, `view.${ext}`);
        await writeFile(file, body, 'utf8');
        const result = await fingerprintFile(file, `src/view.${ext}`);
        expect(result.status, `src/view.${ext}`).toBe('scanned');
        if (result.status !== 'scanned') continue;
        // Scanned AND fingerprinted: a parse that produced no unit would be a
        // vacuous pass.
        expect(result.units.map((u) => u.member.unit)).toEqual(['View']);
      }
      // Case-insensitively, for the same reason `isEligibleFile` lowercases:
      // `View.JS` exists on macOS and Windows filesystems, and it was eligible
      // while parsing without the flag.
      const upper = join(dir, 'Upper.JSX');
      await writeFile(upper, body, 'utf8');
      const result = await fingerprintFile(upper, 'src/Upper.JSX');
      expect(result.status).toBe('scanned');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes a sub-minTokens unit from fingerprinting instead of emitting it', async () => {
    // The amended spec applies minTokens BEFORE grouping: a unit under the bar
    // is never hashed, so it cannot form or join a clone class.
    const below = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts', 1000);
    expect(below.status).toBe('scanned');
    if (below.status !== 'scanned') return;
    expect(below.units).toEqual([]);
    expect(below.unitsBelowMinTokens).toBe(1);

    const above = await fingerprintFile(join(root, 'src', 'good.ts'), 'src/good.ts', 1);
    expect(above.status).toBe('scanned');
    if (above.status !== 'scanned') return;
    expect(above.units.map((u) => u.member.unit)).toEqual(['ok']);
    expect(above.unitsBelowMinTokens).toBe(0);
  });
});

describe('malformed ignorePatterns', () => {
  // `ignorePatterns` is typed `readonly string[]`, but the config reaches
  // `buildCloneIndex` from `EntropyConfig.analyze.duplication`, which an
  // adopter fills in from untyped `harness.config.json`. `minimatch` throws
  // `TypeError: invalid pattern` on every non-string, and the eligibility loop
  // is the one loop in the module outside a `try` — so before this guard, one
  // bad glob escaped `detectDuplication` AND `EntropyAnalyzer.analyze()` and
  // took the whole entropy run (drift, dead code, patterns, complexity,
  // coupling, size budget) down with it. The casts below are the point: they
  // reproduce what untyped JSON can deliver.

  it('returns Err naming the offending index for a null pattern, instead of throwing', async () => {
    const result = await buildCloneIndex([join(root, 'src', 'good.ts')], {
      rootDir: root,
      ignorePatterns: [null] as unknown as string[],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_CONFIG');
    expect(result.error.details.reason).toBe('invalid-ignore-pattern');
    // The index is what makes the message actionable in a config with 8 globs.
    expect(result.error.message).toContain('duplication.ignorePatterns[0]');
    expect(result.error.message).toContain('null');
    expect(result.error.suggestions.length).toBeGreaterThan(0);
  });

  it('returns Err for a non-string pattern at its real index, not the first', async () => {
    const result = await buildCloneIndex([join(root, 'src', 'good.ts')], {
      rootDir: root,
      ignorePatterns: ['**/dist/**', 42] as unknown as string[],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details.reason).toBe('invalid-ignore-pattern');
    expect(result.error.message).toContain('duplication.ignorePatterns[1]');
    expect(result.error.message).toContain('42');
  });

  it('treats an empty-string pattern as inert rather than refusing the scan', async () => {
    // Measured, not assumed: `minimatch(path, '')` is `false` for every path,
    // so an empty entry excludes nothing and cannot hide a file. Refusing it
    // would be fail-closed behavior over an inert typo (spec decision D4).
    const result = await buildCloneIndex([join(root, 'src', 'good.ts')], {
      rootDir: root,
      ignorePatterns: [''],
      // `good.ts` is a 2-line function, under the shipped 40-token floor;
      // without this the unit lands in `unitsBelowMinTokens` and the
      // assertion below would be vacuous for the wrong reason.
      minTokens: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stats.filesScanned).toBe(1);
    expect(result.value.stats.filesIgnored).toBe(0);
    expect(result.value.stats.unitsFingerprinted).toBeGreaterThan(0);
  });
});

describe('zero-discovery guard', () => {
  it('returns Err for an empty file list rather than an empty index', async () => {
    const result = await buildCloneIndex([], { rootDir: root });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_CONFIG');
    expect(result.error.message).toMatch(/zero source files/i);
    expect(result.error.details.reason).toBe('zero-files-discovered');
    expect(result.error.suggestions.length).toBeGreaterThan(0);
  });

  it('returns Err when every candidate is filtered out by extension', async () => {
    const result = await buildCloneIndex([join(root, 'notes.md')], { rootDir: root });
    expect(result.ok).toBe(false);
  });

  it('returns Err when ignorePatterns exclude every candidate', async () => {
    const result = await buildCloneIndex([join(root, 'src', 'good.ts')], {
      rootDir: root,
      ignorePatterns: ['**/src/**'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/zero source files/i);
  });

  it('returns Err when every eligible file is skipped', async () => {
    // At 100% skip, `classes: []` is indistinguishable from the zero-discovery
    // case the guard above refuses: nothing was actually read, so reporting a
    // clean pass would be a lie.
    const result = await buildCloneIndex([join(root, 'src', 'absent.ts')], {
      rootDir: root,
      ignorePatterns: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PARSE_ERROR');
    expect(result.error.details.reason).toBe('all-files-skipped');
    expect(result.error.message).toMatch(/zero readable source files/i);
    expect(result.error.message).toMatch(/1 unreadable/);
    expect(result.error.suggestions.length).toBeGreaterThan(0);
    // Advice keyed to the reason observed: a read failure, so permissions.
    const advice = result.error.suggestions.join('\n');
    expect(advice).toMatch(/file permissions/i);
    expect(advice).not.toMatch(/normalization or digest/i);
  });

  it('returns Err when every eligible file is unparseable, not Ok with zero classes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dup-allbroken-'));
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      for (const name of ['a.ts', 'b.ts', 'c.ts']) {
        await writeFile(join(dir, 'src', name), `export function broken( {\n`, 'utf8');
      }
      const result = await buildCloneIndex(
        ['a.ts', 'b.ts', 'c.ts'].map((n) => join(dir, 'src', n)),
        { rootDir: dir, ignorePatterns: [] }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.details.reason).toBe('all-files-skipped');
      expect(result.error.message).toMatch(/3 unparseable/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('still returns Ok for a partial skip, recording the skip as evidence', async () => {
    // 1-of-N is a scan that happened: it read real files and can report on them.
    const result = await buildCloneIndex(
      [join(root, 'src', 'good.ts'), join(root, 'src', 'absent.ts')],
      { rootDir: root, ignorePatterns: [] }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stats.filesScanned).toBe(1);
    expect(result.value.stats.filesSkipped).toBe(1);
    expect(result.value.skipped).toEqual([
      {
        file: 'src/absent.ts',
        reason: 'unreadable',
        message: expect.any(String),
        errorName: 'Error',
        originalError: expect.any(Error),
      },
    ]);
    expect(result.value.skipped[0]!.message.length).toBeGreaterThan(0);
  });

  it('caps the skipped evidence array while keeping the counts exact', async () => {
    // `skipped` was the only unbounded array on the index (`classes` is capped
    // by maxClasses): a repo with thousands of unparseable files yielded one
    // entry per file, each carrying a full parse message and the Error behind
    // it, and Phase 2 serializes every one into an AnalysisError.
    const broken = MAX_EVIDENCE_ENTRIES + 2;
    const dir = await mkdtemp(join(tmpdir(), 'dup-cap-'));
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      const names: string[] = [];
      for (let i = 0; i < broken; i += 1) {
        // Zero-padded so discovery order is the order they are listed in.
        const name = `b${String(i).padStart(4, '0')}.ts`;
        names.push(name);
        await writeFile(join(dir, 'src', name), `export function broken( {\n`, 'utf8');
      }
      // One readable file, so the all-files-skipped guard does not fire and the
      // Ok path's stats are observable.
      await writeFile(
        join(dir, 'src', 'good.ts'),
        `export function ok(a: number) {\n  return a + 1;\n}\n`,
        'utf8'
      );
      const result = await buildCloneIndex(
        [...names, 'good.ts'].map((n) => join(dir, 'src', n)),
        { rootDir: dir, ignorePatterns: [] }
      );
      if (!result.ok) throw new Error(`expected ok: ${result.error.message}`);
      const stats = result.value.stats;

      // The count is exact; the evidence is a bounded sample of it.
      expect(stats.filesSkipped).toBe(broken);
      expect(result.value.skipped).toHaveLength(MAX_EVIDENCE_ENTRIES);
      expect(stats.skippedTruncated).toBe(broken - MAX_EVIDENCE_ENTRIES);
      expect(stats.skippedTruncated).toBe(stats.filesSkipped - result.value.skipped.length);
      // Discovery order, truncating the tail rather than the head.
      expect(result.value.skipped[0]!.file).toBe('src/b0000.ts');
      expect(result.value.skipped.at(-1)!.file).toBe(
        `src/b${String(MAX_EVIDENCE_ENTRIES - 1).padStart(4, '0')}.ts`
      );
      expect(stats.filesScanned).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports the exact reason breakdown even once the evidence array is capped', async () => {
    // The summary is counted as skips happen, not derived from the capped
    // array, so the message cannot understate the damage.
    const broken = MAX_EVIDENCE_ENTRIES + 3;
    const dir = await mkdtemp(join(tmpdir(), 'dup-cap-all-'));
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      const names: string[] = [];
      for (let i = 0; i < broken; i += 1) {
        const name = `b${String(i).padStart(4, '0')}.ts`;
        names.push(name);
        await writeFile(join(dir, 'src', name), `export function broken( {\n`, 'utf8');
      }
      const result = await buildCloneIndex(
        names.map((n) => join(dir, 'src', n)),
        { rootDir: dir, ignorePatterns: [] }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain(`all ${broken} eligible file(s)`);
      expect(result.error.message).toContain(`${broken} unparseable`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('records a parse failure on skipped with its reason and message', async () => {
    const result = await buildCloneIndex(
      [join(root, 'src', 'good.ts'), join(root, 'src', 'broken.ts')],
      { rootDir: root, ignorePatterns: [] }
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.skipped.map((entry) => [entry.file, entry.reason])).toEqual([
      ['src/broken.ts', 'unparseable'],
    ]);
    // The evidence Phase 2 needs to raise an AnalysisError, not a bare count.
    expect(result.value.skipped[0]!.message.length).toBeGreaterThan(0);
    expect(result.value.stats.filesSkipped).toBe(result.value.skipped.length);
  });
});
