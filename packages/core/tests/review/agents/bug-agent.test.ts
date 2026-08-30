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

  it('does not flag division by a SCREAMING_CASE constant or number (cannot be runtime-zero)', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/age.ts',
          content: [
            'const ageDays = Math.floor((now - mtimeMs) / DAY_MS);',
            'const half = total / 2;',
          ].join('\n'),
          reason: 'changed',
          lines: 2,
        },
      ],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('division'))).toBe(false);
  });

  it('does not flag scoped-package import paths in code as division', () => {
    // `@harness-engineering/types` etc. contain a `/` but are not division —
    // real division in a prettier-formatted codebase is spaced (`a / b`).
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/factory.ts',
          content: [
            "import { BackendDef } from '@harness-engineering/types';",
            "import { rankModels } from '@harness-engineering/local-models';",
            'export function make(): number {',
            '  return 42;',
            '}',
          ].join('\n'),
          reason: 'changed',
          lines: 5,
        },
      ],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('division'))).toBe(false);
  });

  it('does not scan non-code files for division-by-zero (scoped pkg name in a changeset)', () => {
    // A Markdown changeset lists scoped package names like `@scope/pkg`; the `/`
    // must not be read as a division operator (regression: required-review FP).
    const bundle = makeBundle({
      changedFiles: [
        {
          path: '.changeset/some-change.md',
          content: [
            '---',
            "'@harness-engineering/orchestrator': minor",
            "'@harness-engineering/types': minor",
            '---',
            '',
            'A change.',
          ].join('\n'),
          reason: 'changed',
          lines: 6,
        },
      ],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('division'))).toBe(false);
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

// Regression: issue #1501 — `review-ci` emitted "No test files found" on a diff
// that itself added/modified five `*.test.ts` files (two newly added), because
// the detector credited test files only from `contextFiles`, never from the diff.
describe('detectMissingTests — test files present in the diff (issue #1501)', () => {
  it('does not report "no test files" when the diff itself adds/modifies test files', () => {
    // Mirrors the issue diff: three source files + five test files (two new).
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'ts/src/guardian/analysis-emit.ts',
          content: 'export const x = 1;',
          reason: 'changed',
          lines: 1,
        },
        {
          path: 'ts/src/guardian/cli.ts',
          content: 'export const y = 2;',
          reason: 'changed',
          lines: 1,
        },
        {
          path: 'ts/src/guardian/pr-check.ts',
          content: 'export const z = 3;',
          reason: 'changed',
          lines: 1,
        },
        {
          path: 'ts/test/guardian-analysis-emit.test.ts',
          content: 'it("a", () => {});',
          reason: 'changed',
          lines: 1,
        },
        {
          path: 'ts/test/guardian-coverage-notice-surface.test.ts',
          content: 'it("b", () => {});',
          reason: 'changed',
          lines: 1,
        },
        // Newly-added test files — the ones that must be credited.
        {
          path: 'ts/test/guardian-diff-provenance.test.ts',
          content: 'it("c", () => {});',
          reason: 'changed',
          lines: 1,
        },
        {
          path: 'ts/test/guardian-provenance-integration.test.ts',
          content: 'it("d", () => {});',
          reason: 'changed',
          lines: 1,
        },
        {
          path: 'ts/test/guardian-skipped-non-abstain.test.ts',
          content: 'it("e", () => {});',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [], // nothing pulled in as context — tests live in the diff
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.filter((f) => f.title.toLowerCase().includes('no test')).length).toBe(0);
  });

  it('credits a newly-added test file even when it is the only companion', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/service.ts',
          content: 'export function work() { return 1; }',
          reason: 'changed',
          lines: 1,
        },
        {
          path: 'src/service.test.ts',
          content: 'it("works", () => {});',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.filter((f) => f.title.toLowerCase().includes('no test')).length).toBe(0);
  });

  it('does not classify CHANGELOG.md / non-code files as source requiring tests', () => {
    const bundle = makeBundle({
      changedFiles: [
        { path: 'CHANGELOG.md', content: '# Changelog\n- entry', reason: 'changed', lines: 2 },
        { path: 'package-lock.json', content: '{}', reason: 'changed', lines: 1 },
      ],
      contextFiles: [],
    });
    const findings = runBugDetectionAgent(bundle);
    // Only non-source files changed → no "source files without tests" finding,
    // and CHANGELOG.md must not head the evidence list.
    expect(findings.filter((f) => f.title.toLowerCase().includes('no test')).length).toBe(0);
  });

  it('treats a test-support module (test kit under test/) as non-source', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'ts/test/guardian-cli-testkit.ts',
          content: 'export const kit = {};',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.filter((f) => f.title.toLowerCase().includes('no test')).length).toBe(0);
  });

  it('still flags a genuine source-only diff with no accompanying tests', () => {
    const bundle = makeBundle({
      changedFiles: [
        {
          path: 'src/service.ts',
          content: 'export function work() { return 1; }',
          reason: 'changed',
          lines: 1,
        },
      ],
      contextFiles: [],
    });
    const findings = runBugDetectionAgent(bundle);
    expect(findings.some((f) => f.title.toLowerCase().includes('no test'))).toBe(true);
  });
});
