import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChurn, rankByChurnComplexity } from '../pick-hotspots.mjs';

test('parseChurn counts file occurrences across commits', () => {
  const log = 'a.ts\nb.ts\n\na.ts\n';
  const churn = parseChurn(log);
  assert.equal(churn.get('a.ts'), 2);
  assert.equal(churn.get('b.ts'), 1);
});

test('rankByChurnComplexity sorts by churn*loc and truncates to n', () => {
  const churn = new Map([
    ['a.ts', 5],
    ['b.ts', 1],
    ['c.ts', 3],
  ]);
  const loc = new Map([
    ['a.ts', 100],
    ['b.ts', 1000],
    ['c.ts', 400],
  ]);
  const ranked = rankByChurnComplexity(churn, loc, 2);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].file, 'c.ts'); // 3*400 = 1200 (highest)
  assert.equal(ranked[1].file, 'b.ts'); // 1*1000 = 1000 (> a: 5*100 = 500)
});
