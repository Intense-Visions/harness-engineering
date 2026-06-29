import { describe, it, expect } from 'vitest';
import { strength007SnapshotSignalMismatch } from './strength-007-snapshot-signal-mismatch';
import { CHECK_SIGNAL_MAP } from '../../health-signals';
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

describe('STRENGTH-007 uses the derived CHECK_SIGNAL_MAP (SC4/SC5)', () => {
  it('reads the real, derived signal vocabulary (no local map)', () => {
    expect(CHECK_SIGNAL_MAP.deps.sort()).toEqual(['circular-deps', 'layer-violations'].sort());
    expect(CHECK_SIGNAL_MAP.entropy.sort()).toEqual(['dead-code', 'drift'].sort());
    expect(CHECK_SIGNAL_MAP.docs).toEqual(['doc-gaps']);
    expect(CHECK_SIGNAL_MAP.security).toEqual(['security-findings']);
  });
});

describe('STRENGTH-007 snapshot/signal mismatch detect', () => {
  it('flags a passing security check while security-findings is present', () => {
    const findings = strength007SnapshotSignalMismatch.detect(
      ctx({
        healthSnapshot: { checks: { security: { passed: true } }, signals: ['security-findings'] },
      })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe('STRENGTH-007');
    expect(findings[0]!.message).toMatch(/security/);
    expect('severity' in findings[0]!).toBe(false);
  });

  it('REGRESSION: fires on entropy/deps/docs mismatches that the old map silently missed (SC5)', () => {
    const findings = strength007SnapshotSignalMismatch.detect(
      ctx({
        healthSnapshot: {
          checks: {
            entropy: { passed: true },
            deps: { passed: true },
            docs: { passed: true },
          },
          signals: ['drift', 'layer-violations', 'doc-gaps'],
        },
      })
    );
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.id === 'STRENGTH-007')).toBe(true);
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
        ctx({ healthSnapshot: { checks: { entropy: { passed: false } }, signals: ['drift'] } })
      )
    ).toEqual([]);
  });

  it('ignores metrics-only signals (no check maps to them, SC3)', () => {
    expect(
      strength007SnapshotSignalMismatch.detect(
        ctx({ healthSnapshot: { checks: { deps: { passed: true } }, signals: ['high-coupling'] } })
      )
    ).toEqual([]);
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
