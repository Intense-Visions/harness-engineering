/**
 * Regression tests for #2266: one unmerged snapshot PR silently stalled the
 * architecture timeline. snapshot.yml's PR fallback found the open
 * `chore/arch-snapshot-*` PR and `exit 0`-ed, discarding every later week's
 * capture behind a green run (Oct 5 / 12 / 19 2026 were lost while #2232 sat open).
 *
 * The fix folds each new point into the waiting PR via a union merge
 * (scripts/merge-arch-timeline.mjs), so the PR accumulates every week it blocks.
 * The merge logic is unit-tested; the workflow wiring is asserted over its text,
 * like workflow-merge-race.test.mjs (the defect lives in the YAML).
 *
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeTimelines } from '../../scripts/merge-arch-timeline.mjs';

const snap = (capturedAt, commitHash) => ({
  capturedAt,
  commitHash,
  stabilityScore: 50,
  metrics: {},
});
const tl = (...snapshots) => ({ version: 1, snapshots });

test('union keeps the open PR’s points AND the fresh capture (no week dropped)', () => {
  const main = tl(snap('2026-09-21T12:00:00.000Z', 'a'));
  const pr = tl(snap('2026-09-21T12:00:00.000Z', 'a'), snap('2026-09-28T12:00:00.000Z', 'b'));
  // The fresh capture is taken from MAIN, so it lacks the PR's Sep 28 point.
  const ours = tl(snap('2026-09-21T12:00:00.000Z', 'a'), snap('2026-10-05T12:00:00.000Z', 'c'));
  const merged = mergeTimelines([main, pr, ours]);
  assert.deepEqual(
    merged.snapshots.map((s) => s.commitHash),
    ['a', 'b', 'c'],
    'every distinct point survives, in chronological order'
  );
});

test('merge is idempotent and skips missing inputs', () => {
  const t = tl(snap('2026-09-21T12:00:00.000Z', 'a'), snap('2026-09-28T12:00:00.000Z', 'b'));
  assert.deepEqual(mergeTimelines([t, t, null, undefined]), t);
});

test('CLI writes the TimelineManager.save() shape and treats an empty input as absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arch-tl-'));
  const a = join(dir, 'a.json');
  const empty = join(dir, 'empty.json');
  const out = join(dir, 'out.json');
  writeFileSync(a, JSON.stringify(tl(snap('2026-09-21T12:00:00.000Z', 'a'))));
  writeFileSync(empty, '');
  const script = fileURLToPath(new URL('../../scripts/merge-arch-timeline.mjs', import.meta.url));
  execFileSync(process.execPath, [script, out, a, empty, join(dir, 'missing.json')]);
  const raw = readFileSync(out, 'utf8');
  assert.equal(raw, JSON.stringify(tl(snap('2026-09-21T12:00:00.000Z', 'a')), null, 2));
});

const step = (() => {
  const yml = readFileSync(
    new URL('../../.github/workflows/snapshot.yml', import.meta.url),
    'utf8'
  );
  const start = yml.indexOf('- name: Commit snapshot');
  assert.ok(start !== -1, 'snapshot.yml must still carry the "Commit snapshot" step');
  return yml.slice(start);
})();

test('snapshot.yml: an open snapshot PR no longer discards the point behind a clean exit', () => {
  assert.doesNotMatch(
    step,
    /already open and unmerged; not opening a duplicate/,
    'the silent skip that froze the series (#2266) must be gone'
  );
  const fold = step.match(/if \[ -n "\$EXISTING_JSON" \]; then([\s\S]*?)\n {10}fi\n/);
  assert.ok(fold, 'the open-PR branch must be a readable block');
  assert.match(
    fold[1],
    /node scripts\/merge-arch-timeline\.mjs "\$TIMELINE"[\s\S]*?"\$RUNNER_TEMP\/pr\.json" "\$RUNNER_TEMP\/ours\.json"/,
    'the new point must be union-merged with the open PR’s points, not copied over them'
  );
  assert.match(
    fold[1],
    /git push --force-with-lease="\$BRANCH:origin\/\$BRANCH" origin "HEAD:\$BRANCH"/,
    'the fold must update the EXISTING PR branch under a lease, never open a second PR'
  );
  assert.doesNotMatch(fold[1], /gh pr create/, 'never stack a second snapshot PR');
  assert.match(
    fold[1],
    /::warning::[^\n]*open \$\{AGE_DAYS\} day/,
    'the stall must be announced with its age'
  );
  assert.match(fold[1], /::error::[\s\S]*?exit 1/, 'a failed fold must go red, not green');
});

test('snapshot.yml: the fresh-PR path also union-merges rather than copying ours', () => {
  assert.doesNotMatch(
    step,
    /git checkout "\$OURS" -- "\$TIMELINE"/,
    'copying our capture over a newer main can drop a point main gained meanwhile'
  );
});
