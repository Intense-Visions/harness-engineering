import { describe, it, expect } from 'vitest';
import type { CiReviewResult, DiffInfo } from '@harness-engineering/core';
import type { SignalResult } from '@harness-engineering/signals';
import type { OutcomeVerdict } from '@harness-engineering/intelligence';
import {
  BRIEF_MARKER,
  buildBriefBody,
  upsertComment,
  readReview,
  gatherSignalsSafe,
  findOutcomeVerdict,
} from '../../src/commands/pre-merge-brief';
import type { SignalsResult } from '@harness-engineering/signals';

/** An outcome-eval verdict fixture. */
function makeOutcome(over: Partial<OutcomeVerdict> = {}): OutcomeVerdict {
  return {
    verdict: 'NOT_SATISFIED',
    confidence: 'high',
    rationale: 'criterion A is unmet: no test covers the empty case',
    judgedAgainst: 'success-criteria',
    unmetCriteria: ['crit A'],
    authority: 'blocking',
    ...over,
  };
}

/** A signal fixture with an overridable status/value. */
function makeSignal(over: Partial<SignalResult> = {}): SignalResult {
  return {
    id: 'coverage-trend-down-30d',
    label: 'Coverage trend (30d)',
    value: 82,
    unit: '%',
    trend: 'flat',
    betterDirection: 'up',
    status: 'ok',
    threshold: { warn: 80, alert: 70 },
    history: [],
    detail: 'coverage holding steady',
    source: 'arch/timeline.json',
    ...over,
  } as SignalResult;
}

type Verdict = CiReviewResult['verdict'];
type Finding = Verdict['findings'][number];

/** A review finding fixture. */
function makeFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'critical',
    file: 'src/a.ts',
    lineRange: [10, 12],
    title: 'null deref',
    ...over,
  } as Finding;
}

/** A review verdict fixture (not schema-validated; passed directly to the renderer). */
function makeVerdict(over: Partial<Verdict> = {}): Verdict {
  return {
    assessment: 'request-changes',
    runner: 'claude',
    findings: [],
    blockingFindings: [],
    skipped: false,
    ...over,
  } as Verdict;
}

/** A DiffInfo fixture with two changed files, one new. */
function makeDiff(): DiffInfo {
  return {
    changedFiles: ['a.ts', 'b.ts'],
    newFiles: ['b.ts'],
    deletedFiles: [],
    totalDiffLines: 12,
    fileDiffs: new Map(),
  };
}

describe('buildBriefBody', () => {
  it('starts with the hidden marker and a header', () => {
    const body = buildBriefBody({ diff: makeDiff() });
    const firstNonEmpty = body.split('\n').find((l) => l.trim().length > 0) ?? '';
    // The marker and a `# ` title lead the brief.
    expect(body).toContain(BRIEF_MARKER);
    expect(body).toMatch(/^# /m);
    // The marker precedes the visible title.
    expect(body.indexOf(BRIEF_MARKER)).toBeLessThan(body.indexOf('# '));
    expect(firstNonEmpty).toBeTruthy();
  });

  it('renders diff summary when diff present', () => {
    const body = buildBriefBody({ diff: makeDiff() });
    expect(body).toMatch(/Diff summary/);
    // file + line counts appear
    expect(body).toContain('2');
    expect(body).toContain('12');
  });

  it('diff summary unavailable when diff omitted', () => {
    const body = buildBriefBody({});
    const idx = body.indexOf('Diff summary');
    expect(idx).toBeGreaterThanOrEqual(0);
    // the "unavailable" line follows the heading
    expect(body.slice(idx)).toMatch(/unavailable/i);
  });

  it('renders review verdict with assessment + finding counts', () => {
    const f1 = makeFinding({ id: 'f1', title: 'null deref', severity: 'critical' });
    const f2 = makeFinding({
      id: 'f2',
      title: 'style nit',
      severity: 'warning',
      file: 'src/b.ts',
      lineRange: undefined,
    });
    const body = buildBriefBody({
      review: makeVerdict({ findings: [f1, f2], blockingFindings: [f1] }),
    });
    // a review heading + the assessment appear
    expect(body).toMatch(/review/i);
    expect(body).toContain('request-changes');
    // blocking + other findings rendered as bullets
    expect(body).toContain('null deref');
    expect(body).toContain('style nit');
    expect(body).toMatch(/src\/a\.ts:10/);
  });

  it('review section unavailable when review omitted', () => {
    const body = buildBriefBody({});
    const idx = body.search(/review/i);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(body.slice(idx)).toMatch(/unavailable/i);
  });

  it('renders Signal status with each signal current value + status', () => {
    const signals: SignalResult[] = [
      makeSignal({ id: 'coverage-trend-down-30d', label: 'Coverage', value: 82, status: 'ok' }),
      makeSignal({ id: 'complexity-trend-up-30d', label: 'Complexity', value: 15, status: 'warn' }),
      makeSignal({ id: 'eval-fail-rate', label: 'Eval fail rate', value: 40, status: 'alert' }),
      makeSignal({
        id: 'baseline-auto-update-count',
        label: 'Baseline auto-updates',
        value: null,
        status: 'pending',
      }),
      makeSignal({
        id: 'pr-merged-without-multi-persona-review',
        label: 'Unreviewed merges',
        value: null,
        status: 'error',
      }),
    ];
    const body = buildBriefBody({ signals });
    // heading is EXACTLY "Signal status" (not "deltas")
    expect(body).toContain('Signal status');
    expect(body).not.toMatch(/deltas/i);
    // each label + status appears
    expect(body).toContain('Coverage');
    expect(body).toContain('Complexity');
    expect(body).toContain('Eval fail rate');
    expect(body).toContain('warn');
    expect(body).toContain('alert');
  });

  it('Signal status unavailable when signals empty/omitted', () => {
    const body = buildBriefBody({ signals: [] });
    const idx = body.indexOf('Signal status');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(body.slice(idx)).toMatch(/unavailable/i);
  });

  it('renders outcome verdict when present', () => {
    const body = buildBriefBody({
      outcome: makeOutcome({
        verdict: 'NOT_SATISFIED',
        rationale: 'criterion A is unmet',
        unmetCriteria: ['crit A'],
      }),
    });
    expect(body).toMatch(/outcome/i);
    expect(body).toContain('NOT_SATISFIED');
    expect(body).toContain('criterion A is unmet');
  });

  it("outcome section says 'not yet evaluated' when omitted", () => {
    const body = buildBriefBody({});
    const idx = body.search(/outcome/i);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(body.slice(idx)).toMatch(/not yet evaluated/i);
  });
});

describe('worth your eyes derivation', () => {
  const WORTH_HEADING = '## 👀 Worth your eyes';

  /** Extract only the "worth your eyes" section text (heading to end). */
  function worthSection(body: string): string {
    const idx = body.indexOf(WORTH_HEADING);
    expect(idx).toBeGreaterThanOrEqual(0);
    return body.slice(idx);
  }

  it('contains exactly the union of blocking findings, warn/alert signals, and unmet criteria', () => {
    const blocking = makeFinding({ id: 'b1', title: 'sql injection', severity: 'critical' });
    const nonBlocking = makeFinding({ id: 'n1', title: 'style nit', severity: 'warning' });
    const signals: SignalResult[] = [
      makeSignal({ label: 'ok-sig', status: 'ok' }),
      makeSignal({ label: 'warn-sig', status: 'warn' }),
      makeSignal({ label: 'alert-sig', status: 'alert' }),
      makeSignal({ label: 'pending-sig', status: 'pending' }),
      makeSignal({ label: 'error-sig', status: 'error' }),
    ];
    const body = buildBriefBody({
      review: makeVerdict({ findings: [blocking, nonBlocking], blockingFindings: [blocking] }),
      signals,
      outcome: makeOutcome({ verdict: 'NOT_SATISFIED', unmetCriteria: ['crit A', 'crit B'] }),
    });
    const section = worthSection(body);
    // included: blocking finding + warn signal + alert signal + both unmet criteria
    expect(section).toContain('sql injection');
    expect(section).toContain('warn-sig');
    expect(section).toContain('alert-sig');
    expect(section).toContain('crit A');
    expect(section).toContain('crit B');
    // excluded: non-blocking finding + ok/pending/error signals
    expect(section).not.toContain('style nit');
    expect(section).not.toContain('ok-sig');
    expect(section).not.toContain('pending-sig');
    expect(section).not.toContain('error-sig');
  });

  it('empty when nothing qualifies', () => {
    const body = buildBriefBody({
      review: makeVerdict({
        assessment: 'approve',
        findings: [],
        blockingFindings: [],
      }),
      signals: [makeSignal({ status: 'ok' })],
      outcome: makeOutcome({ verdict: 'SATISFIED', unmetCriteria: [] }),
    });
    const section = worthSection(body);
    expect(section).toMatch(/nothing flagged/i);
  });

  it('section appears last', () => {
    const body = buildBriefBody({
      signals: [makeSignal({ status: 'warn' })],
    });
    const worthIdx = body.indexOf(WORTH_HEADING);
    expect(worthIdx).toBeGreaterThan(body.indexOf('Signal status'));
    expect(worthIdx).toBeGreaterThan(body.indexOf('Outcome evaluation'));
  });
});

describe('upsertComment (sticky)', () => {
  /** An in-memory comment record with an id and a body. */
  interface FakeComment {
    id: number;
    body: string;
  }

  it('first run posts a new comment; second run on same PR updates it (not appends)', () => {
    const store: FakeComment[] = [];
    let nextId = 1;
    const patch = (id: number, body: string) => {
      const c = store.find((x) => x.id === id);
      if (c) c.body = body;
    };
    const post = (body: string) => {
      store.push({ id: nextId++, body });
    };

    // First run: no marked comment yet → posts.
    const body1 = buildBriefBody({}) + '\n' + BRIEF_MARKER;
    upsertComment(store, body1, patch, post);
    expect(store).toHaveLength(1);

    // Second run: a marked comment now exists → PATCHes (array length unchanged).
    const body2 = buildBriefBody({ signals: [] }) + '\nUPDATED\n' + BRIEF_MARKER;
    upsertComment(store, body2, patch, post);
    const marked = store.filter((c) => c.body.includes(BRIEF_MARKER));
    expect(store).toHaveLength(1);
    expect(marked).toHaveLength(1);
    expect(store[0]!.body).toContain('UPDATED');
  });

  it('posts new when no marked comment exists', () => {
    const store: FakeComment[] = [{ id: 99, body: 'unrelated comment' }];
    let posted = 0;
    const patch = () => {
      throw new Error('should not patch');
    };
    const post = () => {
      posted++;
    };
    upsertComment(store, buildBriefBody({}), patch, post);
    expect(posted).toBe(1);
  });
});

describe('input readers (each degrades, never throws)', () => {
  it('readReview parses a CiReviewResult and returns its verdict', () => {
    const verdict = makeVerdict({ assessment: 'approve', findings: [], blockingFindings: [] });
    // NB: an approve verdict must exit 0 to be schema-consistent; here we only
    // exercise JSON.parse + field access, not zod validation.
    const fixture = JSON.stringify({ verdict, exitCode: 0, terminalOutput: '', ranLlmTier: false });
    const readFile = (_p: string) => fixture;
    const out = readReview('some/path.json', readFile);
    expect(out?.assessment).toBe('approve');
  });

  it('readReview returns undefined when path is undefined', () => {
    expect(readReview(undefined, () => 'unused')).toBeUndefined();
  });

  it('readReview returns undefined (does not throw) when read/parse fails', () => {
    const throwing = () => {
      throw new Error('ENOENT');
    };
    expect(readReview('missing.json', throwing)).toBeUndefined();
    expect(readReview('bad.json', () => 'not json{{')).toBeUndefined();
  });

  it('gatherSignalsSafe returns result.signals from the injected gather', async () => {
    const result: SignalsResult = {
      signals: [makeSignal({ status: 'warn', label: 'coverage' })],
      generatedAt: '2026-07-02T00:00:00Z',
    };
    const gather = async (_p: string) => result;
    const out = await gatherSignalsSafe('/proj', gather);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('coverage');
  });

  it('gatherSignalsSafe returns [] when gather rejects', async () => {
    const gather = async (_p: string) => {
      throw new Error('boom');
    };
    const out = await gatherSignalsSafe('/proj', gather);
    expect(out).toEqual([]);
  });

  it('findOutcomeVerdict returns undefined when no store', () => {
    expect(findOutcomeVerdict(undefined, 'abc123')).toBeUndefined();
  });

  it('findOutcomeVerdict returns undefined when headSha undefined', () => {
    const store = { findNodes: () => [] };
    expect(findOutcomeVerdict(store, undefined)).toBeUndefined();
  });

  it('findOutcomeVerdict maps a matching execution_outcome node to a verdict', () => {
    const node = {
      id: 'n1',
      type: 'execution_outcome' as const,
      name: 'outcome',
      metadata: {
        commit: 'abc123',
        verdict: 'NOT_SATISFIED',
        confidence: 'high',
        rationale: 'unmet crit',
        judgedAgainst: 'success-criteria',
        unmetCriteria: ['crit A'],
        authority: 'blocking',
      },
    };
    const store = { findNodes: () => [node] };
    const out = findOutcomeVerdict(store, 'abc123');
    expect(out?.verdict).toBe('NOT_SATISFIED');
    expect(out?.unmetCriteria).toEqual(['crit A']);
  });

  it('findOutcomeVerdict returns undefined when no node matches the headSha', () => {
    const node = {
      id: 'n1',
      type: 'execution_outcome' as const,
      name: 'outcome',
      metadata: { commit: 'zzz999', verdict: 'SATISFIED' },
    };
    const store = { findNodes: () => [node] };
    expect(findOutcomeVerdict(store, 'abc123')).toBeUndefined();
  });
});
