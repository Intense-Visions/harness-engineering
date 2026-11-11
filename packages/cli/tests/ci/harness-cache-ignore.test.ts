import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the `.harness/cache/` ignore contract (#2094).
 *
 * Tooling writes regenerated JSON under `.harness/cache/` (the OSV advisory
 * cache, CI verdict cache, LiteLLM pricing cache, insights impact cache). The
 * pre-push gate and CI run `pnpm format:check` over the WHOLE tree, so an
 * untracked-and-unignored cache directory is a latent gate failure on any PR,
 * whatever it touches.
 *
 * Asserts git's real resolution (not a grep of an ignore file) so a future
 * negation or a rule moved to a different ignore file is still caught.
 * `--no-index` keeps it hermetic: pure pattern matching, the paths need not exist.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');

const MUST_BE_IGNORED = [
  '.harness/cache/osv/npm-left-pad@1.3.0.json',
  '.harness/cache/verdicts/abc123.json',
  '.harness/cache/pricing.json',
  '.harness/cache/staleness-marker.json',
  '.harness/cache/impact.json',
  // Nested package-level .harness dirs (e.g. packages/cli/.harness/) too.
  'packages/cli/.harness/cache/pricing.json',
];

/** Same-scope positive control: a path that must NOT be ignored. */
const MUST_NOT_BE_IGNORED = '.harness/metrics/holiday-confidence.jsonl';

function isIgnored(repoRelPath: string): boolean {
  const res = spawnSync('git', ['check-ignore', '-q', '--no-index', repoRelPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  // 0 = ignored, 1 = not ignored; anything else is a broken invocation, not a verdict.
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(
      `git check-ignore failed for ${repoRelPath} (status=${res.status}): ${res.stderr ?? ''}`
    );
  }
  return res.status === 0;
}

describe('.harness/cache/ ignore contract (#2094)', () => {
  it.each(MUST_BE_IGNORED)('ignores %s', (p) => {
    expect(
      isIgnored(p),
      `${p} is NOT ignored. .harness/cache/ holds regenerated tool caches; left ` +
        `untracked-and-unignored it fails whole-tree format:check on unrelated PRs.`
    ).toBe(true);
  });

  it('positive control: the check can report "not ignored"', () => {
    expect(isIgnored(MUST_NOT_BE_IGNORED)).toBe(false);
  });
});
