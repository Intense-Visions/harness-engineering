import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { EntropyAnalyzer } from '../../src/entropy/analyzer';
import { TypeScriptParser } from '../../src/shared/parsers';
import { detectDuplication } from '../../src/entropy/detectors/duplication';
import { Ok } from '../../src/shared/result';
import { createEntropyError } from '../../src/shared/errors';
import type { DuplicationReport } from '../../src/entropy/types';
import { memberSets } from '../duplication/fixtures';

/**
 * Spy on the module the ANALYZER imports. `analyzer.ts` imports
 * `detectDuplication` from `'./detectors/duplication'`, which resolves to the
 * same module this path names, so the spy sits on the analyzer's own binding.
 *
 * If vitest ever resolved those two specifiers differently, the
 * "not called" assertions for criterion 7 would silently become vacuous. The
 * "calls the detector exactly once when enabled" case below is the positive
 * control against that: it fails loudly if the spy is not the analyzer's.
 */
vi.mock('../../src/entropy/detectors/duplication', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/entropy/detectors/duplication')>();
  return { ...actual, detectDuplication: vi.fn(actual.detectDuplication) };
});

const PLANTED = join(__dirname, '../fixtures/duplication/planted-clones');

/**
 * `buildSnapshot` returns `Err ENTRY_POINT_NOT_FOUND` over this fixture
 * without explicit entry points — it has no `src/index.ts` (planning decision
 * P9). Measured, not guessed.
 */
const ENTRY_POINTS = ['src/alpha.ts'];

function analyzerFor(analyze: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return new EntropyAnalyzer({
    rootDir: PLANTED,
    parser: new TypeScriptParser(),
    entryPoints: ENTRY_POINTS,
    include: ['src/**/*.ts'],
    analyze,
    ...extra,
  } as never);
}

const CLASS_A = 'src/alpha.ts,src/beta.ts,src/gamma.ts';
const CLASS_D = 'src/generated/gen-a.ts,src/generated/gen-b.ts,src/generated/gen-c.ts';

describe('EntropyAnalyzer duplication wiring', () => {
  it('publishes EntropyReport.duplication when analyze.duplication is an object config', async () => {
    const result = await analyzerFor({ duplication: { ignorePatterns: [] } }).analyze();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.duplication).toBeDefined();
    expect(memberSets(result.value.duplication!.classes)).toEqual([CLASS_A, CLASS_D].sort());
    expect(result.value.analysisErrors).toEqual([]);
  });

  it('runs with `duplication: true` at the shipped defaults', async () => {
    const result = await analyzerFor({ duplication: true }).analyze();
    if (!result.ok) throw new Error('expected ok');
    // The defaults ignore `**/generated/**`, so Class D is filtered and only
    // Class A survives. The two filters compose; neither is the other.
    expect(memberSets(result.value.duplication!.classes)).toEqual([CLASS_A]);
  });

  it('drops a class when EntropyConfig.exclude removes its files (criterion 15)', async () => {
    // The duplication filter is EMPTY here, so the only thing that can drop
    // Class D is `EntropyConfig.exclude` — i.e. discovery is driven solely by
    // include/exclude, and no path in the detector assumes a layout.
    const result = await analyzerFor(
      { duplication: { ignorePatterns: [] } },
      { exclude: ['**/generated/**'] }
    ).analyze();
    if (!result.ok) throw new Error('expected ok');
    expect(memberSets(result.value.duplication!.classes)).toEqual([CLASS_A]);
    expect(result.value.snapshot.files).toHaveLength(9);
  });
});

describe('EntropyAnalyzer duplication invariants', () => {
  beforeEach(() => {
    vi.mocked(detectDuplication).mockClear();
  });

  it('does not call the detector at all when analyze.duplication is absent (criterion 7)', async () => {
    const result = await analyzerFor({ drift: true }).analyze();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.duplication).toBeUndefined();
    // The load-bearing assertion: "shall not parse for duplication" is a
    // claim about work NOT done, which `undefined` alone does not prove.
    expect(vi.mocked(detectDuplication)).not.toHaveBeenCalled();
  });

  it('does not call the detector when analyze.duplication is false (criterion 7)', async () => {
    const result = await analyzerFor({ drift: true, duplication: false }).analyze();
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.duplication).toBeUndefined();
    expect(vi.mocked(detectDuplication)).not.toHaveBeenCalled();
  });

  it('calls the detector exactly once when enabled', async () => {
    const result = await analyzerFor({ duplication: { ignorePatterns: [] } }).analyze();
    if (!result.ok) throw new Error('expected ok');
    expect(vi.mocked(detectDuplication)).toHaveBeenCalledTimes(1);
  });

  it('counts clone classes in totalIssues and in neither errors nor warnings (D4)', async () => {
    const off = await analyzerFor({ duplication: false }).analyze();
    const on = await analyzerFor({ duplication: { ignorePatterns: [] } }).analyze();
    if (!off.ok || !on.ok) throw new Error('expected ok');
    const reported = on.value.duplication!.stats.classesReported;
    expect(reported).toBeGreaterThan(0);
    // Derived from the measured class count, not a hardcoded literal.
    expect(on.value.summary.totalIssues - off.value.summary.totalIssues).toBe(reported);
    expect(on.value.summary.errors).toBe(off.value.summary.errors);
    expect(on.value.summary.warnings).toBe(off.value.summary.warnings);
  });

  it('leaves every sibling detector report unchanged (criterion 9)', async () => {
    const siblings = {
      drift: true,
      deadCode: true,
      patterns: { patterns: [] },
      complexity: {},
      coupling: {},
      sizeBudget: {},
    };
    const off = await analyzerFor({ ...siblings }).analyze();
    const on = await analyzerFor({ ...siblings, duplication: { ignorePatterns: [] } }).analyze();
    if (!off.ok || !on.ok) throw new Error('expected ok');
    for (const key of [
      'drift',
      'deadCode',
      'patterns',
      'complexity',
      'coupling',
      'sizeBudget',
    ] as const) {
      // Pin the denominator: a sibling that produced no report at all would
      // make `undefined === undefined` a vacuous pass for that key.
      expect(on.value[key]).toBeDefined();
      expect(JSON.stringify(on.value[key])).toBe(JSON.stringify(off.value[key]));
    }
    expect(on.value.duplication).toBeDefined();
    expect(off.value.duplication).toBeUndefined();
  });

  it('records a zero-discovery refusal as an AnalysisError and publishes no report (criterion 14)', async () => {
    // `include` matches nothing, so the snapshot carries zero source files
    // and the detector refuses rather than reporting a clean scan.
    const result = await analyzerFor(
      { duplication: true },
      { include: ['src/**/*.nothing-matches-this'] }
    ).analyze();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.duplication).toBeUndefined();
    const errors = result.value.analysisErrors.filter((e) => e.analyzer === 'duplication');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error.details.reason).toBe('zero-files-discovered');
  });

  it('names the bypassed snapshot, not discovery, when graph data replaced it', async () => {
    // `analyze()` has TWO branches: supplying both graphDriftData AND
    // graphDeadCodeData makes `needsSnapshot` false and replaces the snapshot
    // with a minimal one carrying `files: []`. The duplication detector then
    // mapped that empty list and tripped its zero-discovery refusal — a guard
    // built for BROKEN discovery, firing on a deliberately bypassed snapshot,
    // advising the operator to "check that EntropyConfig.include matches real
    // source paths" when the include is fine. `loadEntropyGraphOptions` in
    // `cli/src/mcp/tools/entropy.ts` returns both keys whenever a graph
    // exists, so this is the live path the moment Phase 3 adds `duplication`
    // to the `detect_entropy` enum.
    const result = await analyzerFor({ drift: true, deadCode: true, duplication: true }).analyze({
      graphDriftData: { staleEdges: [], missingTargets: [] },
      graphDeadCodeData: { reachableNodeIds: [], unreachableNodes: [] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `undefined` is the honest "not run" signal; the error says why.
    expect(result.value.duplication).toBeUndefined();
    const errors = result.value.analysisErrors.filter((e) => e.analyzer === 'duplication');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error.details.reason).toBe('snapshot-bypassed');
    // The regression this replaces: a discovery diagnosis for a non-discovery
    // cause. Assert the wrong advice is GONE, not merely that some error exists.
    expect(errors[0]!.error.message).not.toMatch(/zero source files/i);
    // The literal wrong advice the zero-discovery guard gives, verbatim.
    expect(errors[0]!.error.suggestions).not.toContain(
      'Check that EntropyConfig.include matches real source paths'
    );
    expect(errors[0]!.error.suggestions.join('\n')).toMatch(/graph/i);
    // Not run means not parsed: the detector is never reached at all.
    expect(vi.mocked(detectDuplication)).not.toHaveBeenCalled();
  });

  it('degrades duplication alone on a malformed ignorePattern, leaving the run and its siblings intact', async () => {
    // The whole point of making `buildCloneIndex` validate: `minimatch` throws
    // on a non-string pattern, the eligibility loop sits outside every `try`,
    // and `analyze()` holds none of its own — so one bad glob in
    // `harness.config.json` used to reject this promise and take drift,
    // deadCode, patterns, complexity, coupling and sizeBudget with it. A
    // detector whose headline decision is "never fail closed" (D4) must
    // degrade to one AnalysisError instead.
    const result = await analyzerFor({
      drift: true,
      duplication: { ignorePatterns: [null] as unknown as string[] },
    }).analyze();
    // Load-bearing: this is an assertion that the promise RESOLVED at all.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.duplication).toBeUndefined();
    expect(result.value.drift).toBeDefined();
    const errors = result.value.analysisErrors.filter((e) => e.analyzer === 'duplication');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error.code).toBe('INVALID_CONFIG');
    expect(errors[0]!.error.details.reason).toBe('invalid-ignore-pattern');
    expect(errors[0]!.error.message).toContain('duplication.ignorePatterns[0]');
  });

  it('surfaces every detector skipError as an AnalysisError tagged `duplication`, report still published (criterion 12)', async () => {
    // The analyzer's own responsibility here is the splice loop: take the bare
    // EntropyErrors the detector hands back, tag each `analyzer: 'duplication'`,
    // and STILL publish the report. Driving it through a stubbed detector is
    // what makes that deterministic — see the next case for why the real
    // pipeline cannot force a skip.
    const stub: DuplicationReport = {
      classes: [],
      byMember: new Map(),
      collisions: [],
      skipErrors: [
        createEntropyError('PARSE_ERROR', 'skipped a.ts', { reason: 'unreadable', file: 'a.ts' }, [
          'advice',
        ]),
        createEntropyError('PARSE_ERROR', 'skipped b.ts', { reason: 'unparseable', file: 'b.ts' }, [
          'advice',
        ]),
      ],
      stats: {
        filesScanned: 1,
        filesIgnored: 0,
        filesSkipped: 2,
        skippedTruncated: 0,
        unitsFingerprinted: 0,
        unitsBelowMinTokens: 0,
        classesReported: 0,
        classesSuppressed: 0,
        classesTruncated: 0,
        collisionsObserved: 0,
        collisionsTruncated: 0,
        violationCount: 0,
        infoCount: 0,
      },
    };
    vi.mocked(detectDuplication).mockImplementationOnce(async () => Ok(stub));

    const result = await analyzerFor({ duplication: { ignorePatterns: [] } }).analyze();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const errors = result.value.analysisErrors.filter((e) => e.analyzer === 'duplication');
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.error.details.reason)).toEqual(['unreadable', 'unparseable']);
    for (const entry of errors) expect(entry.error.code).toBe('PARSE_ERROR');
    // A gap, not a failure: the report is published alongside the evidence.
    expect(result.value.duplication).toBeDefined();
    expect(result.value.duplication!.stats.filesSkipped).toBe(2);
  });

  it('never hands the detector a file the snapshot parser rejected, so an analyzer-level skip cannot be forced', async () => {
    // Planning decision P1's recorded consequence, asserted as a POSITIVE fact
    // rather than hedged around: `snapshot.files` holds only what the
    // snapshot's own parser accepted, so an unparseable file is gone before
    // the detector sees anything.
    //
    // The structural reason an analyzer-level skip cannot be FORCED is the
    // missing seam, and two earlier statements of it were wrong. `analyze()`
    // does not "unconditionally rebuild the snapshot" — it has two branches,
    // and the graph-fed one replaces the snapshot instead of building it (see
    // the snapshot-bypass case above). Nor is it that there is "no public
    // `buildSnapshot()`": `entropy/index.ts:11` exports it. The actual reason
    // is that `EntropyAnalyzer.snapshot` is PRIVATE and `analyze()` assigns it
    // on every call, down either branch — so a caller has nowhere to inject a
    // snapshot carrying a file the snapshot parser rejected. That is why
    // criterion 12's per-file contract is proven at the DETECTOR level
    // (duplication.test.ts), where a path can be handed in directly, and why
    // the case above stubs the detector to reach the analyzer's tagging loop.
    const { mkdtemp, writeFile, mkdir, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const root = await mkdtemp(join(tmpdir(), 'dup-analyzer-'));
    try {
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src/entry.ts'), 'export const entry = 1;\n', 'utf8');
      await writeFile(join(root, 'src/broken.ts'), 'export function (((( {', 'utf8');
      const analyzer = new EntropyAnalyzer({
        rootDir: root,
        parser: new TypeScriptParser(),
        entryPoints: ['src/entry.ts'],
        include: ['src/**/*.ts'],
        analyze: { duplication: { ignorePatterns: [] } },
      } as never);
      const result = await analyzer.analyze();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const delivered = result.value.snapshot.files.map((f) => f.path);
      expect(delivered.some((f) => f.endsWith('entry.ts'))).toBe(true);
      expect(delivered.some((f) => f.endsWith('broken.ts'))).toBe(false);
      // Consequently: no duplication-tagged error, and a clean partial scan.
      const errors = result.value.analysisErrors.filter((e) => e.analyzer === 'duplication');
      expect(errors).toEqual([]);
      expect(result.value.duplication!.stats.filesSkipped).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
