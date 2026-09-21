import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIncoming, parseConflictedFiles, extractConflictHunks } from '../sync-branch.mjs';

test('parseIncoming reads sha + subject from oneline log', () => {
  const log = 'abc1234 feat(ui): add card\ndef5678 fix(api): guard null';
  assert.deepEqual(parseIncoming(log), [
    { sha: 'abc1234', subject: 'feat(ui): add card' },
    { sha: 'def5678', subject: 'fix(api): guard null' },
  ]);
});

test('parseConflictedFiles reads UU/AA entries from status --porcelain', () => {
  const status = 'UU packages/ui/src/a.tsx\nAA b.ts\n M clean.ts\n?? new.ts';
  assert.deepEqual(parseConflictedFiles(status), ['packages/ui/src/a.tsx', 'b.ts']);
});

test('extractConflictHunks splits ours/theirs', () => {
  const text = [
    'before',
    '<<<<<<< HEAD',
    'const a = 1;',
    '=======',
    'const a = 2;',
    '>>>>>>> origin/main',
    'after',
  ].join('\n');
  assert.deepEqual(extractConflictHunks(text), [{ ours: 'const a = 1;', theirs: 'const a = 2;' }]);
});

test('extractConflictHunks discards diff3 base section', () => {
  const text = [
    '<<<<<<< HEAD',
    'const a = 1;',
    '||||||| base',
    'const a = 0;',
    '=======',
    'const a = 2;',
    '>>>>>>> origin/main',
  ].join('\n');
  assert.deepEqual(extractConflictHunks(text), [{ ours: 'const a = 1;', theirs: 'const a = 2;' }]);
});

test('extractConflictHunks throws on an unclosed hunk', () => {
  const text = ['<<<<<<< HEAD', 'const a = 1;', '=======', 'const a = 2;'].join('\n');
  assert.throws(() => extractConflictHunks(text), /unclosed conflict hunk/);
});
