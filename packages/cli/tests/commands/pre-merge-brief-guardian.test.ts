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
});
