import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the `.harness/metrics/` ignore contract that the Holiday Confidence
 * Tracker's commit-back depends on (#2223).
 *
 * `.harness/.gitignore` deliberately ignores everything under `.harness/metrics/`
 * EXCEPT the `holiday-confidence.jsonl` trend ledger, via a `metrics/*` +
 * `!metrics/holiday-confidence.jsonl` pair (mirroring the `security/timeline.json`
 * precedent). A bare `metrics/` directory-suffix rule anywhere in the ignore
 * chain silently defeats that negation: a directory-suffix ignore stops git
 * descending into the directory at all, so no later `!metrics/...` rule can
 * re-include anything inside it. Re-ORDERING does not help — only removing the
 * bare rule does.
 *
 * That regression has landed twice (9e2b9b46d, then 4ef72cb82 / #2190). Both times
 * it took `Holiday Confidence Tracker` red on every run — `git add` on the ledger
 * exits 1 with "The following paths are ignored by one of your .gitignore files",
 * so the KPI computed fine and its record was thrown away. A prose warning in
 * `.harness/.gitignore` did not prevent either recurrence; this test is the
 * mechanical guard.
 *
 * Why this asserts git's real resolution instead of grepping the ignore file:
 *   - It tests the BEHAVIOUR, so it catches any future way of breaking the
 *     contract — including a bare rule added to the ROOT `.gitignore`, which a
 *     text assertion scoped to `.harness/.gitignore` would never see.
 *   - A text assertion cannot distinguish the legitimate `metrics/*` from the
 *     fatal `metrics/`.
 *
 * Why `--no-index` is REQUIRED: the ledger is a TRACKED file, and plain
 * `check-ignore` skips paths in the index. Without the flag this reads clean at a
 * developer's desk and only ever fails in CI — which is precisely why the stray
 * rule survived review twice.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');

const LEDGER = '.harness/metrics/holiday-confidence.jsonl';

/** Everything else the metrics directory holds — must stay ignored. */
const MUST_STAY_IGNORED = [
  '.harness/metrics/adoption.jsonl',
  '.harness/metrics/skill-events.jsonl',
  '.harness/metrics/refinement-events.jsonl',
  '.harness/metrics/.adoption-cursor',
  '.harness/metrics/.telemetry-cursor',
  '.harness/metrics/published-analyses.json',
];

type IgnoreCheck = { ignored: boolean; rule: string };

function runCheckIgnore(args: string[], repoRelPath: string) {
  const res = spawnSync('git', ['check-ignore', ...args, '--no-index', repoRelPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  // 0 and 1 are the two real verdicts. Anything else (notably 128) is a broken
  // invocation, NOT a verdict — fail loudly rather than letting a non-answer read
  // as "not ignored" and turn this guard permanently green.
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(
      `git check-ignore failed for ${repoRelPath} (status=${res.status}, signal=${res.signal}): ${res.stderr ?? ''}`
    );
  }
  return res;
}

/**
 * Resolve whether git ignores `repoRelPath`, using forward slashes (git accepts
 * them on every platform, so this is win32-safe).
 *
 * `check-ignore` is purely pattern matching under `--no-index`, so the path need
 * not exist on disk — the assertions below stay hermetic rather than depending on
 * which telemetry files a given checkout happens to have produced.
 *
 * The verdict MUST come from the plain (non-`-v`) exit status: 0 = ignored,
 * 1 = not ignored. Under `-v` the exit status instead reports whether any rule
 * MATCHED, and a negation rule counts as a match — so `-v` exits 0 for
 * `!metrics/holiday-confidence.jsonl`, i.e. 0 for a path that is NOT ignored.
 * Keying the verdict off `-v` inverts the answer for exactly the un-ignored path
 * this test exists to protect. `-v` is therefore used only to name the winning
 * rule in the failure message, never to decide.
 */
function checkIgnore(repoRelPath: string): IgnoreCheck {
  const ignored = runCheckIgnore(['-q'], repoRelPath).status === 0;
  const rule = (runCheckIgnore(['-v'], repoRelPath).stdout ?? '').trim();
  return { ignored, rule };
}

describe('.harness/metrics/ ignore contract (#2223)', () => {
  it('leaves the holiday-confidence trend ledger stageable', () => {
    const { ignored, rule } = checkIgnore(LEDGER);

    expect(
      ignored,
      `${LEDGER} is ignored by "${rule}", so the Holiday Confidence Tracker's ` +
        `"git add" step fails and the KPI record is discarded. A bare "metrics/" ` +
        `directory rule defeats the "!metrics/holiday-confidence.jsonl" un-ignore ` +
        `no matter where it sits — DELETE the bare rule rather than reordering it. ` +
        `Keep the "metrics/*" + "!metrics/holiday-confidence.jsonl" pair intact.`
    ).toBe(false);
  });

  it.each(MUST_STAY_IGNORED)('keeps %s ignored', (p) => {
    const { ignored } = checkIgnore(p);

    expect(
      ignored,
      `${p} is NOT ignored. Everything under .harness/metrics/ except the ` +
        `holiday-confidence ledger is generated local telemetry (adoption.jsonl ` +
        `alone is ~1MB) and must never be committed. Un-ignoring the whole ` +
        `directory is a worse defect than the one the sibling test guards: keep ` +
        `the "metrics/*" rule and un-ignore only the ledger.`
    ).toBe(true);
  });
});
