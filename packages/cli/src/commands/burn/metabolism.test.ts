import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { metabolismSection, renderMetabolism, type MetabolismResult } from './metabolism';

/** A minimal, hand-built result so the pure renderer can be tested in isolation. */
function fakeResult(overrides: Partial<MetabolismResult['report']> = {}): MetabolismResult {
  const report = {
    eventCount: 10,
    totalTokens: 1_200_000,
    basalTokens: 420_000,
    anabolicTokens: 780_000,
    unattributableTokens: 0,
    denominatorTokens: 1_200_000,
    basalShare: 0.35,
    unattributableShare: 0,
    rankedWaste: [{ loop: 'ci-rerun', basalTokens: 300_000, shareOfBasal: 0.714 }],
    ...overrides,
  } as MetabolismResult['report'];
  const ledger = {
    tokenSourceCounts: { measured: 7, 'duration-proxy': 3 },
  } as MetabolismResult['ledger'];
  return { report, ledger };
}

describe('renderMetabolism', () => {
  it('renders the basal-share headline, the ranked waste, and the token-source provenance', () => {
    const text = renderMetabolism(fakeResult()).join('\n');
    expect(text).toContain('by token metabolism');
    expect(text).toContain('35.0% basal share');
    expect(text).toContain('420.0K');
    expect(text).toContain('ranked maintenance waste');
    expect(text).toContain('ci-rerun');
    expect(text).toContain('71.4% of basal');
    expect(text).toContain('7 measured, 3 duration-proxied');
  });

  it('omits the ranked-waste block when there is no basal waste to rank', () => {
    const text = renderMetabolism(fakeResult({ rankedWaste: [] })).join('\n');
    expect(text).not.toContain('ranked maintenance waste');
  });
});

describe('metabolismSection', () => {
  it('is empty (invisible in the report) when the repo has no adoption telemetry', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'burn-metabolism-'));
    expect(await metabolismSection(cwd)).toEqual([]);
  });
});
