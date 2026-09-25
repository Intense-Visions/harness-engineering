import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNameStatus,
  parseNumstat,
  classifyChangeType,
  summarizeDiff,
} from '../compute-diff.mjs';

test('parseNameStatus reads status + path', () => {
  const raw = 'M\tpackages/ui/src/a.tsx\nA\tpackages/ui/src/b.tsx\nD\told.ts';
  assert.deepEqual(parseNameStatus(raw), [
    { status: 'M', file: 'packages/ui/src/a.tsx' },
    { status: 'A', file: 'packages/ui/src/b.tsx' },
    { status: 'D', file: 'old.ts' },
  ]);
});

test('parseNumstat sums additions/deletions and ignores binary', () => {
  const raw = '10\t2\tsrc/a.ts\n-\t-\timg.png';
  assert.deepEqual(parseNumstat(raw), [
    { file: 'src/a.ts', added: 10, deleted: 2 },
    { file: 'img.png', added: 0, deleted: 0 },
  ]);
});

test('classifyChangeType prefers commit prefix, falls back to heuristic', () => {
  assert.equal(classifyChangeType('fix(api): guard null', ['a.ts']), 'bugfix');
  assert.equal(classifyChangeType('feat(ui): add card', ['a.ts']), 'feature');
  assert.equal(classifyChangeType('chore: tidy', ['README.md']), 'docs');
  assert.equal(classifyChangeType('wip', ['a.ts', 'a.test.ts']), 'feature');
});

test('summarizeDiff aggregates', () => {
  const s = summarizeDiff(
    [{ status: 'M', file: 'a.ts' }],
    [{ file: 'a.ts', added: 3, deleted: 1 }]
  );
  assert.equal(s.changeCount, 1);
  assert.equal(s.totalAdded, 3);
  assert.equal(s.totalDeleted, 1);
});
