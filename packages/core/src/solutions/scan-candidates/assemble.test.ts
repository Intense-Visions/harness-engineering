import { describe, it, expect } from 'vitest';
import { assembleCandidateReport, suggestCategory } from './assemble';
import type { ScannedCommit } from './git-scan';
import type { Hotspot } from './hotspot';

describe('suggestCategory', () => {
  it.each([
    ['fix: flaky test in pulse runner', 'bug-track/test-failures'],
    ['fix(perf): slow startup', 'bug-track/performance-issues'],
    ['fix: SQL injection in query builder', 'bug-track/security-issues'],
    ['fix: button color contrast', 'bug-track/ui-bugs'],
    ['fix(orchestrator): handle stalled lease', 'bug-track/integration-issues'],
    ['fix: null pointer in parser', 'bug-track/logic-errors'],
    // Security variants (p5-i3)
    ['fix: broken authentication flow', 'bug-track/security-issues'],
    ['fix: authn middleware bypass', 'bug-track/security-issues'],
    ['fix: oauth token refresh race', 'bug-track/security-issues'],
    ['fix: decrypt payload before parse', 'bug-track/security-issues'],
    ['fix: encryption key rotation', 'bug-track/security-issues'],
    ['fix: cryptographic nonce reuse', 'bug-track/security-issues'],
    ['fix: CSRF token mismatch on POST', 'bug-track/security-issues'],
    ['fix: JWT signature validation', 'bug-track/security-issues'],
    // Performance variants (p5-i3)
    ['fix: request timeout under load', 'bug-track/performance-issues'],
    ['fix: N+1 in user list query', 'bug-track/performance-issues'],
    ['fix: OOM in batch processor', 'bug-track/performance-issues'],
    // Database variants (p5-i3) — note "migration" already in original
    ['fix: postgres connection pool exhaustion', 'bug-track/database-issues'],
    ['fix: transaction rollback on dup key', 'bug-track/database-issues'],
  ])('maps %p -> %s', (subject, expected) => {
    expect(suggestCategory(subject)).toBe(expected);
  });
});

describe('assembleCandidateReport', () => {
  const fixes: ScannedCommit[] = [
    {
      sha: 'abc1234',
      subject: 'fix(orchestrator): stalled lease',
      filesChanged: 3,
      branchIterations: 4,
    },
    { sha: 'def5678', subject: 'fix: flaky retry test', filesChanged: 1, branchIterations: 1 },
  ];
  const hotspots: Hotspot[] = [{ path: 'packages/orchestrator/src/state-machine.ts', churn: 12 }];

  it('produces the documented section structure', () => {
    const out = assembleCandidateReport({
      undocumentedFixes: fixes,
      hotspotCandidates: hotspots,
      isoWeek: { year: 2026, week: 18 },
      lookback: '7d',
    });
    expect(out).toMatch(/^# Compound candidates — week 2026-W18$/m);
    expect(out).toContain('## Undocumented fixes (from `git log` past 7d)');
    expect(out).toContain('## Pattern candidates (from churn + hotspot analysis)');
    expect(out).toContain('Run: `/harness:compound "stalled lease"`');
    expect(out).toContain('Suggested category: bug-track/integration-issues');
    expect(out).toContain('packages/orchestrator/src/state-machine.ts');
    expect(out).toContain('12 commits in 7d');
  });

  it('carries the stability report line when a hotspot gate result is supplied', () => {
    const out = assembleCandidateReport({
      undocumentedFixes: [],
      hotspotCandidates: hotspots,
      isoWeek: { year: 2026, week: 18 },
      lookback: '7d',
      hotspotStability: {
        correlation: 0.91,
        stable: true,
        presentation: 'ordered',
        correlationThreshold: 0.7,
        sampleSize: 5,
        windows: { primary: 'most recent 7d', secondary: 'preceding 7d' },
      },
    });
    expect(out).toContain('Ranking stability: stable');
    expect(out).toContain('ρ=0.91');
    expect(out).toContain('most recent 7d vs preceding 7d');
  });

  it('groups hotspots by tier when the ranking is unstable', () => {
    const out = assembleCandidateReport({
      undocumentedFixes: [],
      hotspotCandidates: [
        { path: 'a.ts', churn: 10 },
        { path: 'b.ts', churn: 5 },
      ],
      isoWeek: { year: 2026, week: 18 },
      lookback: '7d',
      hotspotStability: {
        correlation: 0.1,
        stable: false,
        presentation: 'tiered',
        correlationThreshold: 0.7,
        sampleSize: 2,
        windows: { primary: 'most recent 7d', secondary: 'preceding 7d' },
      },
      hotspotTiers: [
        { tier: 1, items: [{ path: 'a.ts', churn: 10 }] },
        { tier: 2, items: [{ path: 'b.ts', churn: 5 }] },
      ],
    });
    expect(out).toContain('Ranking stability: unstable');
    expect(out).toContain('### Tier 1');
    expect(out).toContain('### Tier 2');
  });

  it('writes empty sections when no candidates', () => {
    const out = assembleCandidateReport({
      undocumentedFixes: [],
      hotspotCandidates: [],
      isoWeek: { year: 2026, week: 1 },
      lookback: '7d',
    });
    expect(out).toContain('## Undocumented fixes');
    expect(out).toContain('_(none this week)_');
    expect(out).toContain('## Pattern candidates');
  });
});
