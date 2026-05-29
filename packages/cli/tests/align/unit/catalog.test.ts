/**
 * Tests for the align-design-system catalog registry + public exports.
 *
 * The catalog declares which DRIFT-* codes align v1 ships handling for
 * and whether each code participates as a codemod-or-suggestion or
 * suggestion-only path. These tests pin the registry shape so
 * orchestrator / cross-skill consumers get predictable behavior.
 *
 * Mirrors `tests/drift/catalog/index.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  getAlignCodes,
  lookupAlignCode,
  listAlignCodes,
  getCodemodCapableCodes,
} from '../../../src/align/catalog/index.js';
import {
  getAlignCodes as getAlignCodesPublic,
  lookupAlignCode as lookupAlignCodePublic,
  getCodemodCapableCodes as getCodemodCapableCodesPublic,
} from '../../../src/align/exports.js';
import { getDriftCodes } from '../../../src/drift/catalog/index.js';

describe('align catalog/index', () => {
  it('getAlignCodes() returns the v1 DRIFT-* code set, sorted', () => {
    const codes = getAlignCodes();
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

  it('getAlignCodes() returns a fresh copy — caller mutation does not affect the registry', () => {
    const first = getAlignCodes();
    first.length = 0;
    const second = getAlignCodes();
    expect(second.length).toBe(8);
  });

  it('lookupAlignCode() returns null for unknown codes (forward-compat for DRIFT-V*)', () => {
    expect(lookupAlignCode('DRIFT-V001')).toBeNull();
    expect(lookupAlignCode('NOT-A-DRIFT-CODE')).toBeNull();
  });

  it('lookupAlignCode() classifies T001/T002/T003 as codemod-or-suggestion per spec', () => {
    expect(lookupAlignCode('DRIFT-T001')?.handling).toBe('codemod-or-suggestion');
    expect(lookupAlignCode('DRIFT-T002')?.handling).toBe('codemod-or-suggestion');
    expect(lookupAlignCode('DRIFT-T003')?.handling).toBe('codemod-or-suggestion');
  });

  it('lookupAlignCode() classifies T004 + all P* as suggestion-only per spec', () => {
    expect(lookupAlignCode('DRIFT-T004')?.handling).toBe('suggestion-only');
    expect(lookupAlignCode('DRIFT-P001')?.handling).toBe('suggestion-only');
    expect(lookupAlignCode('DRIFT-P002')?.handling).toBe('suggestion-only');
    expect(lookupAlignCode('DRIFT-P003')?.handling).toBe('suggestion-only');
    expect(lookupAlignCode('DRIFT-P004')?.handling).toBe('suggestion-only');
  });

  it('getCodemodCapableCodes() returns only T001/T002/T003', () => {
    expect(getCodemodCapableCodes()).toEqual(['DRIFT-T001', 'DRIFT-T002', 'DRIFT-T003']);
  });

  it('every catalog entry has a non-empty description', () => {
    for (const entry of listAlignCodes()) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('align catalog covers every code shipped by the drift catalog (v1 parity)', () => {
    // align v1 ships handling for every code detect emits. This guards
    // the spec's "v1 fix scope" decision — if a new DRIFT-* code lands
    // on the detect side without an align entry, this test forces the
    // catalog update conversation.
    const driftCodes = new Set(getDriftCodes());
    const alignCodes = new Set(getAlignCodes());
    for (const code of driftCodes) {
      expect(alignCodes.has(code), `align catalog missing entry for ${code}`).toBe(true);
    }
  });

  it('public re-exports match the catalog module', () => {
    expect(getAlignCodesPublic()).toEqual(getAlignCodes());
    expect(lookupAlignCodePublic('DRIFT-T001')).toEqual(lookupAlignCode('DRIFT-T001'));
    expect(getCodemodCapableCodesPublic()).toEqual(getCodemodCapableCodes());
  });
});
