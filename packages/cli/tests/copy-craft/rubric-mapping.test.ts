import { describe, it, expect } from 'vitest';
import { rubricApplies, SEED_RUBRICS } from '../../src/copy-craft/catalog/rubrics/index';

describe('rubricApplies', () => {
  it('COPY-R001 (WHAT/WHY/HOW-TO-FIX) applies only to error surface', () => {
    const r = SEED_RUBRICS.find((x) => x.id === 'COPY-R001')!;
    expect(rubricApplies(r, 'error')).toBe(true);
    expect(rubricApplies(r, 'log')).toBe(false);
    expect(rubricApplies(r, 'commit')).toBe(false);
  });

  it('COPY-R003 (specific-not-generic) applies to error/log/cli-output', () => {
    const r = SEED_RUBRICS.find((x) => x.id === 'COPY-R003')!;
    expect(rubricApplies(r, 'error')).toBe(true);
    expect(rubricApplies(r, 'log')).toBe(true);
    expect(rubricApplies(r, 'cli-output')).toBe(true);
    expect(rubricApplies(r, 'commit')).toBe(false);
  });

  it('COPY-R006 (describes-change-not-work) applies to commit + pr-description', () => {
    const r = SEED_RUBRICS.find((x) => x.id === 'COPY-R006')!;
    expect(rubricApplies(r, 'commit')).toBe(true);
    expect(rubricApplies(r, 'pr-description')).toBe(true);
    expect(rubricApplies(r, 'comment')).toBe(false);
  });

  it('COPY-R008 (WHY-not-WHAT) applies to comment only', () => {
    const r = SEED_RUBRICS.find((x) => x.id === 'COPY-R008')!;
    expect(rubricApplies(r, 'comment')).toBe(true);
    expect(rubricApplies(r, 'error')).toBe(false);
  });
});

describe('SEED_RUBRICS', () => {
  it('contains exactly 8 seed rubrics', () => {
    expect(SEED_RUBRICS).toHaveLength(8);
  });

  it('every rubric has an ID in the COPY-R\\d{3} namespace', () => {
    for (const r of SEED_RUBRICS) {
      expect(r.id).toMatch(/^COPY-R\d{3}$/);
    }
  });

  it('every rubric has reserved ADR 0020 catalog fields populated', () => {
    for (const r of SEED_RUBRICS) {
      expect(r.contribution.addedAt).toBeTruthy();
      expect(r.contribution.addedBy).toBe('seed');
      expect(r.signal.invocations).toBe(0);
      expect(r.version).toBeGreaterThan(0);
    }
  });

  it('every rubric declares at least one applicable surface', () => {
    for (const r of SEED_RUBRICS) {
      expect(r.appliesToSurfaces.length).toBeGreaterThan(0);
    }
  });
});
