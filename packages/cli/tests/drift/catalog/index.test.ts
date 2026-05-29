/**
 * Tests for the drift finding-code catalog registry + public exports.
 *
 * The catalog is the single source of truth for the DRIFT-* codes
 * detect-design-drift v1 ships. These tests pin the registry shape so
 * cross-skill consumers (orchestrator, align introspection) get
 * predictable behavior.
 *
 * Mirrors `tests/audit/component-anatomy/unit/catalog-registry.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  getDriftCodes,
  lookupDriftCode,
  listDriftCodes,
} from '../../../src/drift/catalog/index.js';
import {
  getDriftCodes as getDriftCodesPublic,
  lookupDriftCode as lookupDriftCodePublic,
} from '../../../src/drift/exports.js';
import { severityFor } from '../../../src/drift/findings/finding.js';

describe('drift catalog/index', () => {
  it('getDriftCodes() returns the v1 DRIFT-* code set, sorted', () => {
    const codes = getDriftCodes();
    expect(codes).toEqual([
      'DRIFT-P001',
      'DRIFT-P002',
      'DRIFT-P003',
      'DRIFT-P004',
      'DRIFT-T001',
      'DRIFT-T002',
      'DRIFT-T003',
      'DRIFT-T004',
    ]);
  });

  it('getDriftCodes() returns a fresh copy — caller mutation does not affect the registry', () => {
    const first = getDriftCodes();
    first.length = 0;
    const second = getDriftCodes();
    expect(second.length).toBe(8);
  });

  it('lookupDriftCode() returns null for unknown codes (forward-compat)', () => {
    expect(lookupDriftCode('DRIFT-T999')).toBeNull();
    expect(lookupDriftCode('NOT-A-DRIFT-CODE')).toBeNull();
  });

  it('lookupDriftCode() returns the entry with category + standardSeverity', () => {
    const entry = lookupDriftCode('DRIFT-T001');
    expect(entry).not.toBeNull();
    expect(entry?.category).toBe('token-bypass');
    expect(entry?.standardSeverity).toBe('error');

    const pEntry = lookupDriftCode('DRIFT-P001');
    expect(pEntry?.category).toBe('primitive-adoption');
  });

  it('listDriftCodes() entries match the inline severityFor() outputs under standard strictness', () => {
    // Cross-check: the catalog IS the source of truth for standard
    // severity. If these drift, severityFor() and the public catalog
    // would emit contradictory data — this guard locks them together.
    for (const entry of listDriftCodes()) {
      expect(severityFor(entry.code, 'standard')).toBe(entry.standardSeverity);
    }
  });

  it('every catalog entry has a non-empty description', () => {
    for (const entry of listDriftCodes()) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('catalog entries are categorized as token-bypass or primitive-adoption only', () => {
    for (const entry of listDriftCodes()) {
      expect(['token-bypass', 'primitive-adoption']).toContain(entry.category);
    }
  });

  it('public re-exports match the catalog module', () => {
    expect(getDriftCodesPublic()).toEqual(getDriftCodes());
    expect(lookupDriftCodePublic('DRIFT-T001')).toEqual(lookupDriftCode('DRIFT-T001'));
  });
});
