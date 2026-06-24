import { describe, it, expect } from 'vitest';
import {
  CHECK_SIGNAL_MAP,
  strength007SnapshotSignalMismatch,
} from './strength-007-snapshot-signal-mismatch';
import type { ProjectContext } from '../types';

function ctx(partial: Partial<ProjectContext>): ProjectContext {
  return {
    root: '/r',
    mode: 'adopter',
    config: null,
    preCommit: null,
    hookFiles: [],
    workflows: [],
    healthSnapshot: null,
    ...partial,
  };
}

describe('STRENGTH-007 CHECK_SIGNAL_MAP', () => {
  it('maps each check to its contradicting signal name', () => {
    expect(CHECK_SIGNAL_MAP).toEqual({
      security: 'security-findings',
      entropy: 'entropy-drift',
      deps: 'dependency-violations',
      perf: 'perf-regression',
      docs: 'doc-coverage',
      lint: 'lint-issues',
    });
  });
});

describe('STRENGTH-007 snapshot/signal mismatch detect', () => {
  it('flags a check that passed while its contradicting signal is present', () => {
    const findings = strength007SnapshotSignalMismatch.detect(
      ctx({
        healthSnapshot: { checks: { security: { passed: true } }, signals: ['security-findings'] },
      })
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.id).toBe('STRENGTH-007');
    expect(f.file).toBe('.harness/health-snapshot.json');
    expect(f.message).toMatch(/security/);
    expect(f.message).toMatch(/security-findings/);
    expect('severity' in f).toBe(false);
  });

  it('passes when a check passed and there is no contradicting signal', () => {
    expect(
      strength007SnapshotSignalMismatch.detect(
        ctx({ healthSnapshot: { checks: { security: { passed: true } }, signals: [] } })
      )
    ).toEqual([]);
  });

  it('passes an honest failure (passed false with the signal listed)', () => {
    expect(
      strength007SnapshotSignalMismatch.detect(
        ctx({
          healthSnapshot: {
            checks: { security: { passed: false } },
            signals: ['security-findings'],
          },
        })
      )
    ).toEqual([]);
  });

  it('flags multiple contradicting checks', () => {
    const findings = strength007SnapshotSignalMismatch.detect(
      ctx({
        healthSnapshot: {
          checks: { security: { passed: true }, deps: { passed: true } },
          signals: ['security-findings', 'dependency-violations'],
        },
      })
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.id)).toEqual(['STRENGTH-007', 'STRENGTH-007']);
  });

  it('is not evaluable when healthSnapshot is null', () => {
    const c = ctx({ healthSnapshot: null });
    expect(strength007SnapshotSignalMismatch.evaluable?.(c)).toBe(false);
    expect(strength007SnapshotSignalMismatch.detect(c)).toEqual([]);
  });

  it('is not evaluable when the snapshot is malformed (no checks)', () => {
    const c = ctx({ healthSnapshot: { foo: 'bar' } });
    expect(strength007SnapshotSignalMismatch.evaluable?.(c)).toBe(false);
    expect(strength007SnapshotSignalMismatch.detect(c)).toEqual([]);
  });
});
