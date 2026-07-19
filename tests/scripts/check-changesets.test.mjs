/**
 * Regression test for the no-release changeset marker being fragile under
 * prettier.
 *
 * `pnpm changeset --empty` writes an empty marker whose frontmatter is
 * `---\n\n---` (a blank line between delimiters). Prettier collapses that to
 * `---\n---`, which the old fixed-shape regex (`/^---\r?\n([\s\S]*?)\r?\n---/`)
 * failed to match — so the gate no longer saw the marker as "empty" and
 * demanded a per-package changeset. The workaround was to add every marker to
 * `.prettierignore`, and those per-PR lines then conflicted between concurrent
 * PRs.
 *
 * The fix parses the frontmatter by line so both forms read as empty. These
 * tests assert that. Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseChangesetFrontmatter } from '../../scripts/check-changesets.mjs';

test('changeset: canonical empty marker (---\\n\\n---) is empty', () => {
  const { isEmpty, packages } = parseChangesetFrontmatter('---\n\n---\n\nNo release.\n');
  assert.equal(isEmpty, true);
  assert.deepEqual(packages, []);
});

test('changeset: prettier-collapsed marker (---\\n---) is also empty', () => {
  // The exact shape prettier produces after reformatting the canonical marker.
  const { isEmpty, packages } = parseChangesetFrontmatter('---\n---\n\nNo release.\n');
  assert.equal(isEmpty, true);
  assert.deepEqual(packages, []);
});

test('changeset: CRLF-collapsed marker is empty', () => {
  const { isEmpty } = parseChangesetFrontmatter('---\r\n---\r\n\r\nNo release.\r\n');
  assert.equal(isEmpty, true);
});

test('changeset: a real changeset reports its packages and is not empty', () => {
  const raw = "---\n'@harness-engineering/core': patch\n'@harness-engineering/cli': minor\n---\n\nDid a thing.\n";
  const { isEmpty, packages } = parseChangesetFrontmatter(raw);
  assert.equal(isEmpty, false);
  assert.deepEqual(packages, ['@harness-engineering/core', '@harness-engineering/cli']);
});

test('changeset: non-changeset text (no frontmatter) is not treated as empty', () => {
  const { isEmpty, packages } = parseChangesetFrontmatter('# Just a heading\n\nsome prose\n');
  assert.equal(isEmpty, false);
  assert.deepEqual(packages, []);
});
