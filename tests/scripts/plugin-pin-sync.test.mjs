/**
 * Drift guard for the MCP version pin in the plugin manifests.
 *
 * The release flow bumps `packages/cli/package.json` and, via the `version`
 * script (`… && node scripts/sync-plugin-pin.mjs`), the pinned
 * `@harness-engineering/cli@<v>` token in every plugin manifest. These tests
 * assert the pins EQUAL the CLI version, so a hand-edit or a skipped sync is
 * caught in review — and exercise the sync helpers directly.
 *
 * Run with: node --test tests/scripts/plugin-pin-sync.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MANIFEST_PATHS,
  readCliVersion,
  findPinnedVersion,
  syncManifestContent,
} from '../../scripts/sync-plugin-pin.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('every manifest pins @harness-engineering/cli to the CLI package version', () => {
  const version = readCliVersion(REPO_ROOT);
  assert.match(version, /^\d+\.\d+\.\d+/, 'CLI version should look like a semver');

  for (const rel of MANIFEST_PATHS) {
    const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
    const pinned = findPinnedVersion(manifest);
    assert.notEqual(
      pinned,
      null,
      `${rel}: expected an @harness-engineering/cli pin in mcpServers.harness.args`
    );
    assert.equal(
      pinned,
      version,
      `${rel}: pin ${pinned} is out of sync with CLI version ${version} — run: node scripts/sync-plugin-pin.mjs`
    );
  }
});

test('syncManifestContent is idempotent at the target version', () => {
  const raw = readFileSync(path.join(REPO_ROOT, MANIFEST_PATHS[0]), 'utf8');
  const version = readCliVersion(REPO_ROOT);
  const result = syncManifestContent(raw, version);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.content, raw, 'content must be byte-for-byte unchanged when already in sync');
});

test('syncManifestContent rewrites only the version token and preserves formatting', () => {
  const raw = readFileSync(path.join(REPO_ROOT, MANIFEST_PATHS[0]), 'utf8');
  const current = findPinnedVersion(JSON.parse(raw));
  const result = syncManifestContent(raw, '99.0.0');
  assert.equal(result.status, 'synced');
  assert.equal(result.previous, current);
  assert.equal(
    findPinnedVersion(JSON.parse(result.content)),
    '99.0.0',
    'result must be valid JSON with the new pin'
  );
  // The only textual difference is the version token.
  assert.equal(
    result.content
      .split('@harness-engineering/cli@99.0.0')
      .join(`@harness-engineering/cli@${current}`),
    raw,
    'nothing but the version number should change'
  );
});

test('findPinnedVersion returns null when no pin is present', () => {
  assert.equal(
    findPinnedVersion({ mcpServers: { harness: { args: ['-y', 'harness-mcp'] } } }),
    null
  );
  assert.equal(findPinnedVersion({}), null);
});
