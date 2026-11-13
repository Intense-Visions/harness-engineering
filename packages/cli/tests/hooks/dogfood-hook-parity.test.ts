import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// packages/cli/tests/hooks -> repo root
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const DOGFOOD = path.join(REPO, '.harness', 'hooks');
const SOURCE = path.join(REPO, 'packages', 'cli', 'src', 'hooks');
const profile = JSON.parse(fs.readFileSync(path.join(DOGFOOD, 'profile.json'), 'utf-8')) as {
  fileHashes: Record<string, string>;
};
const read = (p: string) => fs.readFileSync(p, 'utf-8');
const sha = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/**
 * KNOWN GAP (pre-existing, deliberately not auto-fixed): dogfood copies older than their source.
 * Their recorded hash matches the stale copy, so `harness hooks init` would refresh them. This
 * list may only shrink: each entry must still drift, or the test asks for its removal.
 */
const KNOWN_CONTENT_DRIFT = ['format-check.js', 'quality-warner.js'];
/** Security hooks that may never be exempted. */
const MUST_MATCH = ['autonomy-guard.js', 'block-no-verify.js'];

const withSource = Object.keys(profile.fileHashes)
  .filter((n) => fs.existsSync(path.join(SOURCE, n)))
  .sort();

describe('dogfood .harness/hooks match packages/cli/src/hooks', () => {
  it('positive control: the profile lists sourced hooks, including the security hooks', () => {
    expect(withSource.length).toBeGreaterThanOrEqual(10);
    for (const n of MUST_MATCH) {
      expect(withSource).toContain(n);
      expect(KNOWN_CONTENT_DRIFT).not.toContain(n);
    }
  });

  it.each(withSource.filter((n) => !KNOWN_CONTENT_DRIFT.includes(n)))(
    '%s: dogfood copy is byte-identical to its source',
    (n) => {
      expect(read(path.join(DOGFOOD, n))).toBe(read(path.join(SOURCE, n)));
    }
  );

  it.each(withSource)('%s: profile.json records the hash of the dogfood copy', (n) => {
    expect(profile.fileHashes[n]).toBe(sha(path.join(DOGFOOD, n)));
  });

  it.each(KNOWN_CONTENT_DRIFT)(
    '%s: still drifted (remove it from KNOWN_CONTENT_DRIFT once synced)',
    (n) => {
      expect(read(path.join(DOGFOOD, n))).not.toBe(read(path.join(SOURCE, n)));
    }
  );
});
