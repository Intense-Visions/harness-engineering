/**
 * Unit tests for the pure helpers in scripts/design-capture.mjs (the design-craft
 * capture command). The Playwright/render path needs a browser + a running
 * dashboard and is exercised manually; here we lock the file→route mapping and
 * input parsing that decide what gets captured. Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  slugForFile,
  parseTargetFiles,
  pageFiles,
  baseUrl,
} from '../../scripts/design-capture.mjs';

test('slugForFile lowercases the page basename', () => {
  assert.equal(slugForFile('packages/dashboard/src/client/pages/Signals.tsx'), 'signals');
  assert.equal(slugForFile('pages/Kanban.tsx'), 'kanban');
});

test('slugForFile honors known route-slug overrides', () => {
  assert.equal(slugForFile('pages/DecayTrends.tsx'), 'decay');
});

test('parseTargetFiles reads a JSON array and tolerates junk', () => {
  assert.deepEqual(parseTargetFiles('["a.tsx","b.tsx"]'), ['a.tsx', 'b.tsx']);
  assert.deepEqual(parseTargetFiles('["a.tsx", 1, null]'), ['a.tsx']); // non-strings dropped
  assert.deepEqual(parseTargetFiles(undefined), []);
  assert.deepEqual(parseTargetFiles('not json'), []);
  assert.deepEqual(parseTargetFiles('{"not":"array"}'), []);
});

test('pageFiles keeps only dashboard page .tsx files', () => {
  const input = [
    'packages/dashboard/src/client/pages/Health.tsx',
    'packages/dashboard/src/client/components/KpiCard.tsx', // not a page
    'packages/dashboard/src/client/pages/Roadmap.ts', // not .tsx
    'src/pages/Other.tsx',
  ];
  assert.deepEqual(pageFiles(input), [
    'packages/dashboard/src/client/pages/Health.tsx',
    'src/pages/Other.tsx',
  ]);
});

test('baseUrl resolves from DASHBOARD_BASE_URL, then port, then default', () => {
  assert.equal(baseUrl({ DASHBOARD_BASE_URL: 'http://x:9' }), 'http://x:9');
  assert.equal(baseUrl({ DASHBOARD_CLIENT_PORT: '4000' }), 'http://localhost:4000');
  assert.equal(baseUrl({}), 'http://localhost:3700');
});
