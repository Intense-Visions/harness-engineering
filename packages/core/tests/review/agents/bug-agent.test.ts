import { describe, it, expect } from 'vitest';
import {
  runBugDetectionAgent,
  BUG_DETECTION_DESCRIPTOR,
} from '../../../src/review/agents/bug-agent';
import type { ContextBundle } from '../../../src/review/types';

function makeBundle(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    domain: 'bug',
    changeType: 'feature',
    changedFiles: [
      {
        path: 'src/service.ts',
        content: [
          'export function divide(a: number, b: number): number {',
          '  return a / b;',
          '}',
        ].join('\n'),
        reason: 'changed',
        lines: 3,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
    ...overrides,
  };
}

describe('BUG_DETECTION_DESCRIPTOR', () => {
  it('has domain bug and tier strong', () => {
    expect(BUG_DETECTION_DESCRIPTOR.domain).toBe('bug');
    expect(BUG_DETECTION_DESCRIPTOR.tier).toBe('strong');
  });

  it('has a displayName', () => {
    expect(BUG_DETECTION_DESCRIPTOR.displayName).toBe('Bug Detection');
  });
});

describe('runBugDetectionAgent()', () => {
  it('returns ReviewFinding[] with domain bug', () => {
    const findings = runBugDetectionAgent(makeBundle());
    expect(Array.isArray(findings)).toBe(true);
    for (const f of findings) {
      expect(f.domain).toBe('bug');
    }
  });

  it('all findings have validatedBy heuristic', () => {
    const findings = runBugDetectionAgent(makeBundle());
    for (const f of findings) {
      expect(f.validatedBy).toBe('heuristic');
    }
  });

  it('detects division without zero check', () => {
    const findings = runBugDetectionAgent(makeBundle());
    expect(
      findings.some(
        (f) => f.title.toLowerCase().includes('division') || f.title.toLowerCase().includes('zero')
      )
    ).toBe(true);
  });

  it('detects missing error handling (catch without handling)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/fetcher.ts',
          content: [
            'export async function fetchData(url: string) {',
            '  try {',
            '    const res = await fetch(url);',
            '    return res.json();',
            '  } catch (e) {}',
            '}',
          ].join('\n'),
          reason: 'changed',
          lines: 6,
        },
      ],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(
      findings.some(
        (f) => f.title.toLowerCase().includes('error') || f.title.toLowerCase().includes('catch')
      )
    ).toBe(true);
  });

  it('detects missing test files when no test context is present', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/service.ts',
          content: 'export function doWork() { return 42; }',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [], // no test files
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('test'))).toBe(true);
  });

  it('does not flag missing tests when test context files exist', () => {
    const bundle = makeBundle({
      contextFiles: [
        {
          path: 'tests/service.test.ts',
          content: 'describe("doWork", () => { it("works", () => {}) });',
          reason: 'test',
          lines: 1,
        },
      ],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.filter((f) => f.title.toLowerCase().includes('no test')).length).toBe(0);
  });

  it('generates unique ids', () => {
    const findings = runBugDetectionAgent(makeBundle());
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
