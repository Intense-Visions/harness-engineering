import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  GUARDIAN_ANALYSIS_SCHEMA,
  GUARDIAN_ANALYSIS_VERSION,
} from '@harness-engineering/intelligence';
import type { GuardianAnalysis } from '@harness-engineering/intelligence';
import {
  BRIEF_MARKER,
  buildBriefBody,
  gatherGuardianSafe,
  loadOutcomeStore,
  readReview,
  runPreMergeBrief,
} from '../../src/commands/pre-merge-brief';

function makeGuardian(over: Partial<GuardianAnalysis> = {}): GuardianAnalysis {
  return {
    schema: GUARDIAN_ANALYSIS_SCHEMA,
    version: GUARDIAN_ANALYSIS_VERSION,
    generatedAt: '2026-07-19T00:00:00.000Z',
    verdict: 'fail',
    severity: 'error',
    coverageDelta: -4.2,
    files: [{ file: 'src/a.ts', uncoveredLines: [10, 11] }],
    summary: 'handler uncovered',
    ...over,
  };
}

describe('pre-merge-brief guardian section (buildBriefBody)', () => {
  it('renders the Guardian diff-coverage section with summary + file lines when present', () => {
    const body = buildBriefBody({ guardian: [makeGuardian()] });
    expect(body).toContain('## Guardian diff-coverage');
    expect(body).toContain('Guardian diff-coverage: FAIL');
    expect(body).toContain('`src/a.ts: lines 10, 11`');
  });

  it('degrades the Guardian section to "unavailable" when no records are present', () => {
    const body = buildBriefBody({ guardian: [] });
    expect(body).toContain('## Guardian diff-coverage');
    expect(body).toContain('_unavailable / not configured._');
  });

  it('adds a flagged guardian record to "Worth your eyes"', () => {
    const body = buildBriefBody({ guardian: [makeGuardian({ verdict: 'fail' })] });
    const worth = body.slice(body.indexOf('## 👀 Worth your eyes'));
    expect(worth).toContain('🛡️');
    expect(worth).toContain('Guardian diff-coverage: FAIL');
  });

  it('does NOT add a non-flagged (pass/info) guardian record to "Worth your eyes"', () => {
    const body = buildBriefBody({
      guardian: [makeGuardian({ verdict: 'pass', severity: 'info' })],
    });
    const worth = body.slice(body.indexOf('## 👀 Worth your eyes'));
    expect(worth).toContain('_Nothing flagged');
  });
});

describe('gatherGuardianSafe', () => {
  it('degrades to [] when the injected reader rejects (never throws)', async () => {
    const result = await gatherGuardianSafe('/proj', async () => {
      throw new Error('disk error');
    });
    expect(result).toEqual([]);
  });

  it('reads from <cwd>/.harness/analyses via the injected seam', async () => {
    let seenDir = '';
    const result = await gatherGuardianSafe('/proj', async (dir) => {
      seenDir = dir;
      return [makeGuardian()];
    });
    expect(seenDir.replace(/\\/g, '/')).toBe('/proj/.harness/analyses');
    expect(result).toHaveLength(1);
  });
});

describe('runPreMergeBrief guardian wiring', () => {
  function baseOpts() {
    return {
      cwd: '/proj',
      runGit: (_args: string[]) => '',
      resolveRaw: () => 'diff --git a/x b/x\n+line',
      readFile: () => 'unused',
      gather: async () => ({ signals: [], generatedAt: '2026-07-02T00:00:00Z' }),
      store: undefined,
      headSha: undefined,
      from: undefined,
      comment: false,
      log: () => {},
    };
  }

  it('includes guardian findings in the brief when the reader returns records', async () => {
    const res = await runPreMergeBrief({
      ...baseOpts(),
      readGuardian: async () => [makeGuardian()],
    });
    expect(res.body).toContain(BRIEF_MARKER);
    expect(res.body).toContain('Guardian diff-coverage: FAIL');
  });

  it('degrades silently when the reader returns [] (absent archive)', async () => {
    const res = await runPreMergeBrief({
      ...baseOpts(),
      readGuardian: async () => [],
    });
    expect(res.body).toContain('## Guardian diff-coverage');
    expect(res.body).toContain('_unavailable / not configured._');
  });

  it('reads a real .harness/analyses archive via the DEFAULT reader seam', async () => {
    // Drives the real default guardian read path (gatherGuardianSafe ->
    // readGuardianAnalyses) and defaultResolveRaw (no resolveRaw override)
    // against an on-disk archive, end-to-end, with only git stubbed.
    const cwd = mkdtempSync(join(tmpdir(), 'pmb-guardian-'));
    const analysesDir = join(cwd, '.harness', 'analyses');
    mkdirSync(analysesDir, { recursive: true });
    writeFileSync(join(analysesDir, 'g.json'), JSON.stringify(makeGuardian()), 'utf-8');

    const res = await runPreMergeBrief({
      cwd,
      // Injected git returns a non-empty diff so the diff section renders and
      // defaultResolveRaw (the un-overridden seam) is exercised.
      runGit: (args: string[]) => (args[0] === 'diff' ? 'diff --git a/x b/x\n+line' : 'main'),
      readFile: () => 'unused',
      gather: async () => ({ signals: [], generatedAt: '2026-07-02T00:00:00Z' }),
      store: undefined,
      headSha: undefined,
      from: undefined,
      comment: false,
      log: () => {},
    });

    expect(res.body).toContain('Guardian diff-coverage: FAIL');
    expect(res.body).toContain('`src/a.ts: lines 10, 11`');
  });
});

describe('loadOutcomeStore degradation', () => {
  it('returns undefined when the project has no .harness/graph directory', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'pmb-nograph-'));
    await expect(loadOutcomeStore(cwd)).resolves.toBeUndefined();
  });
});

describe('readReview default file-read seam', () => {
  it('reads + parses a review-ci --json artifact from disk (default readFile)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pmb-review-'));
    const p = join(dir, 'review.json');
    writeFileSync(p, JSON.stringify({ verdict: { assessment: 'pass', runner: 'ci' } }), 'utf-8');
    // No readFile injected → exercises the real defaultReadFile seam.
    expect(readReview(p)?.assessment).toBe('pass');
  });

  it('degrades to undefined when the artifact path does not exist', () => {
    expect(readReview(join(tmpdir(), 'nope-does-not-exist.json'))).toBeUndefined();
  });
});
