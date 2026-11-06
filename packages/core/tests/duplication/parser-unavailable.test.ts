/**
 * The duplication module must load `@typescript-eslint/typescript-estree`
 * DYNAMICALLY, and must degrade — not explode — when it cannot be loaded.
 *
 * The mutation this file exists to kill is one line: restoring
 * `import { parse } from '@typescript-eslint/typescript-estree'` at the top of
 * `src/duplication/index.ts`. Under that mutation the throwing `vi.mock`
 * factory below fires while THIS FILE's own static import of
 * `src/duplication/index` is being linked, so every case here fails at import
 * time rather than on an assertion — which is exactly how the defect presented
 * in `src/insights/aggregator-parser-unavailable.test.ts` (#2267): the module
 * graph `insights/aggregator` -> `entropy/analyzer` -> `entropy/detectors/
 * duplication` -> `duplication/index` carried a module-load crash upstream of
 * every guard, and the reported warning became vitest's module-mocking wrapper
 * text instead of the snapshot's `parser is unavailable` message.
 *
 * A throwing factory is the faithful simulation of the real cause (#2267): a
 * broken install, or a `typescript` peer the estree parser rejects, makes the
 * default loader's `import()` REJECT.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@typescript-eslint/typescript-estree', () => {
  throw new Error("Cannot find module '@typescript-eslint/typescript-estree'");
});

import { buildCloneIndex, fingerprintFile, EstreeUnavailableError } from '../../src/duplication';
import { createEstreeGate } from '../../src/duplication/estree';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dup-noparser-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'src', 'readable.ts'),
    `export function ok(a: number) {\n  return a + 1;\n}\n`,
    'utf8'
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('duplication with an unresolvable estree (#2267)', () => {
  it('loads estree dynamically, so importing the module does not throw', async () => {
    // The import at the top of this file already proves it — this case states
    // the property so a failure reads as the property it broke. Under the
    // static-import mutation nothing in this file runs at all.
    expect(typeof buildCloneIndex).toBe('function');
    expect(typeof fingerprintFile).toBe('function');
  });

  it('buildCloneIndex returns Err(parser-unavailable) rather than throwing', async () => {
    const result = await buildCloneIndex([join(root, 'src', 'readable.ts')], {
      rootDir: root,
      ignorePatterns: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected Err');
    // `reason` is the discriminator, not `code`: `PARSE_ERROR` is shared with
    // `'all-files-skipped'` and with unrelated entropy modules.
    expect(result.error.details.reason).toBe('parser-unavailable');
    expect(result.error.code).toBe('PARSE_ERROR');
    // Refuses over the files it did NOT scan, and names the real cause.
    expect(result.error.message).toContain('typescript-estree could not be loaded');
    expect(result.error.message).toContain('Refusing to report a pass over 1 unparsed');
    expect(result.error.details.originalError).toBeInstanceOf(EstreeUnavailableError);
    expect(result.error.suggestions.some((s) => s.includes('pnpm install'))).toBe(true);
  });

  it('buildCloneIndex refuses BEFORE reading, not as 1-skip-per-file', async () => {
    // The distinction is the point of gating up front: a per-file collapse
    // would land in `all-files-skipped`, whose advice ("Check file
    // permissions", "Check that the discovered files are valid TS/JS") is
    // actively wrong for one unresolvable dependency. Asserted via the reason,
    // and via the absence of that advice.
    const result = await buildCloneIndex([join(root, 'src', 'readable.ts')], {
      rootDir: root,
      ignorePatterns: [],
    });
    if (result.ok) throw new Error('expected Err');
    expect(result.error.details.reason).not.toBe('all-files-skipped');
    expect(result.error.suggestions.join(' ')).not.toContain('file permissions');
  });

  it('fingerprintFile degrades a readable file to an internal-error skip', async () => {
    // `fingerprintFile`'s documented "never throws" contract has to hold for a
    // direct caller too, which does not pass through buildCloneIndex's gate.
    const result = await fingerprintFile(join(root, 'src', 'readable.ts'), 'src/readable.ts');

    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') throw new Error('expected skipped');
    // Not `unparseable`: the FILE is fine. Our environment is not.
    expect(result.reason).toBe('internal-error');
    expect(result.errorName).toBe('EstreeUnavailableError');
    expect(result.originalError).toBeInstanceOf(EstreeUnavailableError);
  });

  it('still reports an unreadable file as unreadable, not as the parser', async () => {
    // Ordering claim: the gate sits AFTER the read, so a file-specific failure
    // keeps its file-specific reason exactly as before this change.
    const result = await fingerprintFile(join(root, 'src', 'absent.ts'), 'src/absent.ts');
    if (result.status !== 'skipped') throw new Error('expected skipped');
    expect(result.reason).toBe('unreadable');
  });
});

describe('createEstreeGate', () => {
  it('imports at most once across calls', async () => {
    // The caching claim, asserted rather than assumed: `buildCloneIndex`
    // fingerprints ~2,100 files per run at this repository's scope and each
    // needs `parse`, so a per-file `import()` is the regression to guard.
    let calls = 0;
    const gate = createEstreeGate(async () => {
      calls += 1;
      return { parse: () => ({}) } as never;
    });

    const first = await gate();
    const second = await gate();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it('shares one in-flight import between concurrent callers', async () => {
    let calls = 0;
    const gate = createEstreeGate(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { parse: () => ({}) } as never;
    });

    await Promise.all([gate(), gate(), gate()]);

    // Memoized on the PROMISE, not on the resolved value, so three concurrent
    // callers do not each start their own import.
    expect(calls).toBe(1);
  });

  it('reports a module without a callable parse as unavailable', async () => {
    // A resolution that SUCCEEDS but yields the wrong shape is a distinct
    // failure from a rejection, and it must not reach `parse` as undefined.
    const gate = createEstreeGate(async () => ({ version: '8.0.0' }) as never);

    const result = await gate();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected Err');
    expect(result.error).toBeInstanceOf(EstreeUnavailableError);
    expect(result.error.message).toContain('callable `parse`');
  });

  it('reports a throwing module-namespace property read as unavailable', async () => {
    // A module namespace can be a proxy whose property access throws, so
    // reading `parse` is itself fallible; that must become a value, not an
    // unhandled rejection.
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('namespace read exploded');
        },
      }
    );
    const gate = createEstreeGate(async () => hostile as never);

    const result = await gate();

    if (result.ok) throw new Error('expected Err');
    expect(result.error.message).toContain('namespace read exploded');
  });
});
