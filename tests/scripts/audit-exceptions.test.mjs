/**
 * Unit tests for the auditExceptions reconcile gate (issue #1324).
 *
 * The register was decorative — nothing read it — so a NEW advisory never
 * failed CI and a listed advisory was exempt forever. The reconcile logic makes
 * it load-bearing: every active advisory needs a covering entry that has not
 * lapsed, and a missing `expires` counts as already lapsed (fail closed).
 *
 * These tests pin the pure logic (no network). Run with:
 *   node --test tests/scripts/audit-exceptions.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractAdvisories,
  lapseReason,
  reconcile,
} from '../../scripts/audit-exceptions.mjs';

const NOW = new Date('2026-08-15T12:00:00Z');
const FUTURE = '2026-11-15';
const PAST = '2026-07-01';

test('reconcile: uncovered active advisory fails', () => {
  const { ok, failures } = reconcile({
    activeAdvisoryIds: ['GHSA-aaaa-bbbb-cccc'],
    register: {},
    now: NOW,
  });
  assert.equal(ok, false);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].type, 'uncovered');
  assert.equal(failures[0].id, 'GHSA-aaaa-bbbb-cccc');
});

test('reconcile: expired covering entry fails', () => {
  const { ok, failures } = reconcile({
    activeAdvisoryIds: ['GHSA-aaaa-bbbb-cccc'],
    register: { 'GHSA-aaaa-bbbb-cccc': { reason: 'deferred', expires: PAST } },
    now: NOW,
  });
  assert.equal(ok, false);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].type, 'expired');
});

test('reconcile: missing `expires` is treated as already lapsed → fail', () => {
  const { ok, failures } = reconcile({
    activeAdvisoryIds: ['GHSA-aaaa-bbbb-cccc'],
    register: { 'GHSA-aaaa-bbbb-cccc': { reason: 'no expiry given' } },
    now: NOW,
  });
  assert.equal(ok, false);
  assert.equal(failures[0].type, 'expired');
});

test('reconcile: legacy string entry (pre-migration shape) fails', () => {
  // The old register value was a bare justification string with no expiry.
  const { ok, failures } = reconcile({
    activeAdvisoryIds: ['GHSA-aaaa-bbbb-cccc'],
    register: { 'GHSA-aaaa-bbbb-cccc': 'just a justification, no expiry' },
    now: NOW,
  });
  assert.equal(ok, false);
  assert.equal(failures[0].type, 'expired');
});

test('reconcile: covered + unexpired entry passes', () => {
  const { ok, failures, covered } = reconcile({
    activeAdvisoryIds: ['GHSA-aaaa-bbbb-cccc'],
    register: { 'GHSA-aaaa-bbbb-cccc': { reason: 'deferred', expires: FUTURE } },
    now: NOW,
  });
  assert.equal(ok, true);
  assert.deepEqual(failures, []);
  assert.deepEqual(covered, ['GHSA-aaaa-bbbb-cccc']);
});

test('reconcile: stale entry (no active advisory) warns but stays ok', () => {
  const { ok, warnings } = reconcile({
    activeAdvisoryIds: [],
    register: { 'GHSA-old-old-old': { reason: 'resolved upstream', expires: FUTURE } },
    now: NOW,
  });
  assert.equal(ok, true);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].type, 'stale');
});

test('reconcile: mixed batch reports each failure independently', () => {
  const { ok, failures, covered } = reconcile({
    activeAdvisoryIds: ['GHSA-cov-ered-ok', 'GHSA-unc-over-ed', 'GHSA-exp-ired-x'],
    register: {
      'GHSA-cov-ered-ok': { reason: 'ok', expires: FUTURE },
      'GHSA-exp-ired-x': { reason: 'lapsed', expires: PAST },
    },
    now: NOW,
  });
  assert.equal(ok, false);
  assert.deepEqual(covered, ['GHSA-cov-ered-ok']);
  const types = failures.map((f) => `${f.type}:${f.id}`).sort();
  assert.deepEqual(types, ['expired:GHSA-exp-ired-x', 'uncovered:GHSA-unc-over-ed']);
});

test('lapseReason: expiry is inclusive of its whole UTC day', () => {
  // An entry expiring today is still valid at any time today...
  assert.equal(lapseReason({ expires: '2026-08-15' }, new Date('2026-08-15T23:59:59Z')), null);
  // ...and lapses at the first instant of the next day.
  assert.match(
    lapseReason({ expires: '2026-08-15' }, new Date('2026-08-16T00:00:00Z')) || '',
    /expired/
  );
});

test('lapseReason: invalid date string is lapsed', () => {
  assert.match(lapseReason({ expires: 'not-a-date' }, NOW) || '', /invalid/);
});

test('extractAdvisories: pulls github_advisory_id from the advisories map', () => {
  const auditJson = {
    advisories: {
      1102341: {
        github_advisory_id: 'GHSA-67mh-4wv8-2f99',
        severity: 'moderate',
        module_name: 'esbuild',
      },
      1123525: {
        github_advisory_id: 'GHSA-fx2h-pf6j-xcff',
        severity: 'high',
        module_name: 'vite',
      },
    },
  };
  const advisories = extractAdvisories(auditJson);
  assert.deepEqual(
    advisories.map((a) => a.id).sort(),
    ['GHSA-67mh-4wv8-2f99', 'GHSA-fx2h-pf6j-xcff']
  );
});

test('extractAdvisories: entry without a GHSA falls back to a numeric sentinel', () => {
  const advisories = extractAdvisories({
    advisories: { 999999: { severity: 'low', module_name: 'foo' } },
  });
  assert.deepEqual(advisories, [{ id: 'numeric:999999', severity: 'low', module: 'foo' }]);
});

test('extractAdvisories: empty / malformed audit output yields no advisories', () => {
  assert.deepEqual(extractAdvisories({}), []);
  assert.deepEqual(extractAdvisories(null), []);
  assert.deepEqual(extractAdvisories({ advisories: null }), []);
});
