import { describe, it, expect } from 'vitest';
import { runLearningsAgent, LEARNINGS_DESCRIPTOR } from '../../src/review/agents/learnings-agent';
import type { ContextBundle } from '../../src/review/types';

function makeBundle(
  changedFiles: { path: string; content: string }[],
  contextFiles?: { path: string; content: string; reason: 'convention' | 'changed' }[]
): ContextBundle {
  return {
    domain: 'learnings' as const,
    changeType: 'feature' as const,
    changedFiles: changedFiles.map((f) => ({
      ...f,
      reason: 'changed' as const,
      lines: f.content.split('\n').length,
    })),
    contextFiles: (contextFiles ?? []).map((f) => ({
      ...f,
      lines: f.content.split('\n').length,
    })),
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
  };
}

describe('LEARNINGS_DESCRIPTOR', () => {
  it('has correct domain and tier', () => {
    expect(LEARNINGS_DESCRIPTOR.domain).toBe('learnings');
    expect(LEARNINGS_DESCRIPTOR.tier).toBe('fast');
  });

  it('has display name and focus areas', () => {
    expect(LEARNINGS_DESCRIPTOR.displayName).toBe('Learnings Researcher');
    expect(LEARNINGS_DESCRIPTOR.focusAreas.length).toBeGreaterThan(0);
  });
});

describe('runLearningsAgent', () => {
  it('returns empty findings for bundle with no learnings context', () => {
    const bundle = makeBundle([{ path: 'src/auth.ts', content: 'export function login() {}' }]);
    const findings = runLearningsAgent(bundle);
    expect(findings).toEqual([]);
  });

  it('returns suggestion finding when context file contains relevant learning', () => {
    const bundle = makeBundle(
      [
        {
          path: 'src/state/learnings.ts',
          content: 'export function appendLearning() {}',
        },
      ],
      [
        {
          path: 'learnings-context',
          content:
            '- **2026-04-17 [skill:debugging] [outcome:gotcha]:** The learnings module in src/state/learnings.ts has a race condition when writing concurrently',
          reason: 'convention',
        },
      ]
    );
    const findings = runLearningsAgent(bundle);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.domain).toBe('learnings');
    expect(findings[0]!.severity).toBe('suggestion');
  });

  it('all findings have domain learnings and severity suggestion', () => {
    const bundle = makeBundle(
      [{ path: 'src/auth.ts', content: 'export function login() {}' }],
      [
        {
          path: 'learnings-context',
          content:
            '- **2026-04-17 [skill:debugging]:** The src/auth.ts module needs error handling',
          reason: 'convention',
        },
      ]
    );
    const findings = runLearningsAgent(bundle);
    for (const f of findings) {
      expect(f.domain).toBe('learnings');
      expect(f.severity).toBe('suggestion');
    }
  });

  it('does not produce findings for unrelated learnings', () => {
    const bundle = makeBundle(
      [{ path: 'src/auth.ts', content: 'export function login() {}' }],
      [
        {
          path: 'learnings-context',
          content: '- **2026-04-17 [skill:testing]:** Database migrations need to run in order',
          reason: 'convention',
        },
      ]
    );
    const findings = runLearningsAgent(bundle);
    expect(findings.length).toBe(0);
  });

  it('findings include evidence from the learning entry', () => {
    const learningText =
      '- **2026-04-17 [skill:debugging]:** The src/auth.ts module has a known race condition';
    const bundle = makeBundle(
      [{ path: 'src/auth.ts', content: 'export function login() {}' }],
      [{ path: 'learnings-context', content: learningText, reason: 'convention' }]
    );
    const findings = runLearningsAgent(bundle);
    expect(findings.length).toBe(1);
    expect(findings[0]!.evidence).toContain(learningText);
  });
});
