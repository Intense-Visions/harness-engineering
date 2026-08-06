import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCatalog,
  findFixture,
  scoreRecovery,
  type RecoveryRecord,
} from '@harness-engineering/core';

// Wiring test: the SHIPPED fixtures under templates/rehearsal-fixtures/ must
// parse, and a known-good vs known-bad recovery must map to the expected score.
// This guards the fixtures the CLI resolves at runtime — a malformed manifest
// or a fixture whose expectedCheck drifts from its rubric fails here.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'templates',
  'rehearsal-fixtures'
);

const EXPECTED = [
  { id: 'broken-doc-link', check: 'harness check-docs' },
  { id: 'dependency-cycle', check: 'harness check-arch' },
  { id: 'hardcoded-secret', check: 'harness check-security' },
  { id: 'layer-violation', check: 'harness check-arch' },
] as const;

describe('shipped rehearsal fixtures', () => {
  it('loads every shipped fixture manifest', () => {
    const catalog = loadCatalog(FIXTURES_ROOT);
    expect(catalog.map((m) => m.id)).toEqual(EXPECTED.map((e) => e.id));
  });

  it.each(EXPECTED)('$id exercises $check', ({ id, check }) => {
    const result = findFixture(FIXTURES_ROOT, id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.expectedCheck).toBe(check);
  });

  it.each(EXPECTED)('$id scores 100 for a textbook-clean recovery', ({ id }) => {
    const result = findFixture(FIXTURES_ROOT, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const manifest = result.value;
    const good: RecoveryRecord = {
      fixtureId: manifest.id,
      detected: true,
      identifiedFailureMode: manifest.failureMode,
      checkCited: manifest.expectedCheck,
      fixed: true,
      collateralDamage: false,
    };
    const score = scoreRecovery(manifest, good);
    expect(score.score).toBe(100);
    expect(score.tier).toBe('pass');
  });

  it.each(EXPECTED)('$id scores as fail for a total miss', ({ id }) => {
    const result = findFixture(FIXTURES_ROOT, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const manifest = result.value;
    const miss: RecoveryRecord = {
      fixtureId: manifest.id,
      detected: false,
      fixed: false,
      collateralDamage: false,
    };
    const score = scoreRecovery(manifest, miss);
    expect(score.tier).toBe('fail');
    expect(score.score).toBeLessThan(50);
  });
});
