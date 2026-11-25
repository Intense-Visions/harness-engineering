import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
/** git's own resolution: exit 0 = ignored, 1 = not ignored. */
const ignored = (p: string) =>
  spawnSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: repoRoot }).status;

describe('.harness/reviews ignore contract', () => {
  it('ignores standalone review artifacts', () => {
    expect(ignored('.harness/reviews/feat-x-abc/receipt.json')).toBe(0);
    expect(ignored('.harness/reviews/feat-x-abc/bug.json')).toBe(0);
    expect(ignored('packages/cli/.harness/reviews/x/receipt.json')).toBe(0);
  });
  it('leaves the holiday-confidence ledger stageable: no bare metrics/ rule was added', () => {
    expect(ignored('.harness/metrics/holiday-confidence.jsonl')).toBe(1);
  });
});
