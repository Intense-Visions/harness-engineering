/**
 * Regression tests for the release job racing npm's publish-visibility window
 * (#2289), diagnosed live during the `v13.0.0` release.
 *
 * npm answers 404 for a newly staged version for ~8-10 minutes. Inside that
 * window the old pipeline (a) re-published, collided with its own in-flight
 * publish, and reported npm's `E409 Cannot publish over previously staged
 * version` as a release failure, and (b) pushed a permanent git tag for a
 * version that returned 404, because `changesets/action` pushes a tag for every
 * `New tag:` line it scrapes out of stdout BEFORE it checks the publish
 * command's exit code.
 *
 * A release cannot be exercised end to end, so the behaviour lives in
 * scripts/release-publish.mjs behind injectable seams and is pinned here. The
 * publish child, the registry, the clock and `git tag` are all fakes — these
 * tests touch no network and publish nothing.
 *
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyPublish,
  parsePublishOutput,
  registryUrl,
  runRelease,
  waitForVisibility,
} from '../../scripts/release-publish.mjs';

const LINTER_GEN = '@harness-engineering/linter-gen';
const STATS = '@harness-engineering/stats';

// The changesets logger prefix and the colour codes it emits, so the fixtures
// below are byte-shaped like the real thing (and prove the ANSI stripping).
const B = '\u{1F98B}  ';
const CYAN = '[36m';
const RED = '[31m';
const GREEN = '[32m';
const OFF = '[39m';

const publishingLine = (name, version) =>
  `${B}${CYAN}info${OFF} Publishing ${CYAN}"${name}"${OFF} at ${GREEN}"${version}"${OFF}\n`;

/**
 * Attempt 2 of run 39445097050, transcribed from the job log — with the
 * `Creating git tag...` / `New tag:` lines removed, because the fix publishes
 * with `--no-git-tag`.
 *
 * The split across the two streams is the real one: changesets' `success`/`log`
 * output goes to stdout and its `error` output to stderr, so
 * `packages failed to publish:` (stderr) and the package list under it (stdout)
 * arrive on DIFFERENT pipes. The fake deliberately delivers all of stdout before
 * any of stderr — an ordering Node does not guarantee either way — to pin that
 * the parser never depends on interleaving between the two.
 */
const STAGED_COLLISION_RUN = {
  exitCode: 1,
  stdout: [
    `${B}${CYAN}info${OFF} ${LINTER_GEN} is being published because our local version (0.1.8) has not been published on npm\n`,
    `${B}${CYAN}info${OFF} ${STATS} is being published because our local version (0.2.0) has not been published on npm\n`,
    publishingLine(LINTER_GEN, '0.1.8'),
    publishingLine(STATS, '0.2.0'),
    `${B}${GREEN}success${OFF} packages published successfully:\n${B}${LINTER_GEN}@0.1.8\n`,
    `${B}${STATS}@0.2.0\n`,
  ],
  stderr: [
    `${B}${RED}error${OFF} an error occurred while publishing ${STATS}: E409 409 Conflict - PUT https://registry.npmjs.org/@harness-engineering%2fstats - Cannot publish over previously staged version "0.2.0". \n`,
    `${B}${RED}error${OFF} npm error code E409\n`,
    `${B}${RED}error${OFF} npm error 409 Conflict - PUT https://registry.npmjs.org/@harness-engineering%2fstats - Cannot publish over previously staged version "0.2.0".\n`,
    `${B}${RED}error${OFF} packages failed to publish:\n`,
  ],
};

/** A clean single-package publish. */
const CLEAN_RUN = {
  exitCode: 0,
  stdout: [
    publishingLine(LINTER_GEN, '0.1.8'),
    `${B}${GREEN}success${OFF} packages published successfully:\n${B}${LINTER_GEN}@0.1.8\n`,
  ],
  stderr: [],
};

/**
 * A genuine E409 — the classic "you already shipped this version" rejection.
 * Same error code as the staged collision, different message: it must keep
 * failing the release.
 */
const GENUINE_CONFLICT_RUN = {
  exitCode: 1,
  stdout: [
    publishingLine(STATS, '0.2.0'),
    `${B}${STATS}@0.2.0\n`,
  ],
  stderr: [
    `${B}${RED}error${OFF} an error occurred while publishing ${STATS}: E409 409 Conflict - PUT https://registry.npmjs.org/@harness-engineering%2fstats - Cannot publish over previously published version "0.2.0". \n`,
    `${B}${RED}error${OFF} packages failed to publish:\n`,
  ],
};

const flatten = (run) => run.stdout.join('') + run.stderr.join('');

/** A publish child that replays a fixture through the two stream callbacks. */
function fakePublish(run) {
  return async ({ onStdout, onStderr }) => {
    for (const chunk of run.stdout) onStdout(chunk);
    for (const chunk of run.stderr) onStderr(chunk);
    return { exitCode: run.exitCode };
  };
}

/**
 * A registry whose answer for a given spec can change over successive probes.
 * `statuses` maps `name@version` to either a single status or an array walked
 * one entry per probe (the last entry repeating).
 */
function fakeRegistry(statuses) {
  const calls = [];
  const seen = new Map();
  const fetchImpl = async (url) => {
    calls.push(url);
    const key = [...Object.keys(statuses)].find((spec) => url === registryUrl(parseSpec(spec)));
    if (key === undefined) return { status: 404 };
    const plan = statuses[key];
    if (!Array.isArray(plan)) return { status: plan };
    const index = Math.min(seen.get(key) ?? 0, plan.length - 1);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    return { status: plan[index] };
  };
  return { fetchImpl, calls };
}

function parseSpec(spec) {
  const at = spec.lastIndexOf('@');
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

/** Collects stdout/stderr and records every `git tag` the run performed. */
function harness({ run, statuses, timeoutMs = 90_000, intervalMs = 30_000 }) {
  const out = [];
  const err = [];
  const tagged = [];
  const registry = fakeRegistry(statuses);
  let clock = 0;
  return {
    registry,
    tagged,
    stdout: () => out.join(''),
    stderr: () => err.join(''),
    exit: () =>
      runRelease({
        runPublish: fakePublish(run),
        gitTag: (tag) => {
          tagged.push(tag);
          return { ok: true, created: true };
        },
        stdout: (chunk) => out.push(chunk),
        stderr: (chunk) => err.push(chunk),
        fetchImpl: registry.fetchImpl,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
        timeoutMs,
        intervalMs,
      }),
  };
}

// --- parsing / classification ------------------------------------------------

test('parse: derives attempted versions and the staged collision from the real log', () => {
  const parsed = parsePublishOutput(flatten(STAGED_COLLISION_RUN));
  assert.deepEqual(parsed.attempted, [
    { name: LINTER_GEN, version: '0.1.8' },
    { name: STATS, version: '0.2.0' },
  ]);
  assert.deepEqual(parsed.errored, [STATS]);
  // npm repeats the 409 body in its own error dump; it must be recorded once.
  assert.deepEqual(parsed.stagedCollisions, [{ name: STATS, version: '0.2.0' }]);
  assert.equal(parsed.sawSuccessBlock, true);
  assert.equal(parsed.sawFailureBlock, true);
});

test('classify: a staged-version E409 is success, not failure', () => {
  const parsed = parsePublishOutput(flatten(STAGED_COLLISION_RUN));
  const verdict = classifyPublish({ exitCode: 1, parsed });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.downgraded, true);
  assert.deepEqual(verdict.unexplained, []);
  assert.deepEqual(
    verdict.claimed.map((spec) => `${spec.name}@${spec.version}`),
    [`${LINTER_GEN}@0.1.8`, `${STATS}@0.2.0`]
  );
});

test('classify: any OTHER E409 still fails the release', () => {
  const parsed = parsePublishOutput(flatten(GENUINE_CONFLICT_RUN));
  assert.deepEqual(parsed.stagedCollisions, []);
  const verdict = classifyPublish({ exitCode: 1, parsed });
  assert.equal(verdict.ok, false);
  assert.deepEqual(
    verdict.unexplained.map((spec) => `${spec.name}@${spec.version}`),
    [`${STATS}@0.2.0`]
  );
});

test('classify: a non-zero exit with no per-package rejection is never downgraded', () => {
  const parsed = parsePublishOutput(flatten(CLEAN_RUN));
  const verdict = classifyPublish({ exitCode: 1, parsed });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.downgraded, false);
});

test('classify: fails closed when a success block cannot be matched to any version', () => {
  const parsed = parsePublishOutput(
    `${B}${GREEN}success${OFF} packages published successfully:\n${B}${LINTER_GEN}@0.1.8\n`
  );
  assert.deepEqual(parsed.attempted, []);
  const verdict = classifyPublish({ exitCode: 0, parsed });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.unparseable, true);
  assert.deepEqual(verdict.claimed, []);
});

// --- polling -----------------------------------------------------------------

test('poll: probes at least once even with a zero budget', async () => {
  const registry = fakeRegistry({ [`${LINTER_GEN}@0.1.8`]: 200 });
  const result = await waitForVisibility([{ name: LINTER_GEN, version: '0.1.8' }], {
    fetchImpl: registry.fetchImpl,
    now: () => 0,
    sleep: async () => {},
    timeoutMs: 0,
    intervalMs: 1,
  });
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.missing, []);
});

test('poll: a transport error is a failed probe, not a thrown poll', async () => {
  let calls = 0;
  const result = await waitForVisibility([{ name: LINTER_GEN, version: '0.1.8' }], {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error('ENOTFOUND registry.npmjs.org');
      return { status: 200 };
    },
    now: () => 0,
    sleep: async () => {},
    timeoutMs: 60_000,
    intervalMs: 1,
  });
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.verified, [{ name: LINTER_GEN, version: '0.1.8' }]);
});

// --- end-to-end behaviours ---------------------------------------------------

test('release: a version visible immediately is verified once and tagged', async () => {
  const h = harness({ run: CLEAN_RUN, statuses: { [`${LINTER_GEN}@0.1.8`]: 200 } });
  assert.equal(await h.exit(), 0);
  assert.deepEqual(h.tagged, [`${LINTER_GEN}@0.1.8`]);
  assert.equal(h.registry.calls.length, 1);
  // The action scrapes this exact line out of stdout to push the tag.
  assert.match(h.stdout(), /New tag: {2}@harness-engineering\/linter-gen@0\.1\.8/);
});

test('release: a version visible only after N polls is still tagged, after N polls', async () => {
  const h = harness({
    run: CLEAN_RUN,
    statuses: { [`${LINTER_GEN}@0.1.8`]: [404, 404, 200] },
  });
  assert.equal(await h.exit(), 0);
  assert.equal(h.registry.calls.length, 3);
  assert.deepEqual(h.tagged, [`${LINTER_GEN}@0.1.8`]);
  assert.match(h.stdout(), /not visible yet \(HTTP 404\)/);
});

test('release: a version that never becomes visible fails loudly and is NOT tagged', async () => {
  const h = harness({ run: CLEAN_RUN, statuses: { [`${LINTER_GEN}@0.1.8`]: 404 } });
  const code = await h.exit();
  assert.notEqual(code, 0);
  assert.deepEqual(h.tagged, []);
  assert.doesNotMatch(h.stdout(), /New tag:/);
  assert.match(
    h.stdout(),
    /::error::@harness-engineering\/linter-gen@0\.1\.8 never became visible/
  );
  // Probes at 0s, 30s, 60s and 90s against a 90s budget.
  assert.equal(h.registry.calls.length, 4);
});

test('release: E409 "previously staged" completes green once both versions are visible', async () => {
  const h = harness({
    run: STAGED_COLLISION_RUN,
    statuses: {
      [`${LINTER_GEN}@0.1.8`]: [404, 200],
      [`${STATS}@0.2.0`]: [404, 404, 200],
    },
  });
  assert.equal(await h.exit(), 0);
  assert.deepEqual(h.tagged.sort(), [`${LINTER_GEN}@0.1.8`, `${STATS}@0.2.0`].sort());
  assert.match(h.stdout(), /::notice::@harness-engineering\/stats@0\.2\.0 was rejected with E409/);
  assert.match(h.stdout(), /New tag: {2}@harness-engineering\/stats@0\.2\.0/);
});

test('release: a genuine E409 fails without polling and without tagging', async () => {
  const h = harness({ run: GENUINE_CONFLICT_RUN, statuses: {} });
  const code = await h.exit();
  assert.notEqual(code, 0);
  assert.deepEqual(h.tagged, []);
  assert.doesNotMatch(h.stdout(), /New tag:/);
  assert.match(
    h.stdout(),
    /::error::@harness-engineering\/stats@0\.2\.0 failed to publish for a reason other than a staged-version collision/
  );
  // Nothing was claimed, so the 15-minute poll must not be entered at all.
  assert.equal(h.registry.calls.length, 0);
});

test('release: a premature "New tag:" line from the child is suppressed, not relayed', async () => {
  const h = harness({
    run: {
      exitCode: 0,
      stdout: [
        publishingLine(LINTER_GEN, '0.1.8'),
        `${B}${GREEN}success${OFF} packages published successfully:\n${B}${LINTER_GEN}@0.1.8\n`,
        // What changesets prints when `--no-git-tag` is not honoured.
        `${B}Creating git tag...\n${B}New tag:  ${LINTER_GEN}@0.1.8\n`,
      ],
      stderr: [],
    },
    statuses: { [`${LINTER_GEN}@0.1.8`]: [404, 200] },
  });
  assert.equal(await h.exit(), 0);
  // Exactly one `New tag:` reaches stdout: ours, emitted after verification.
  assert.equal(h.stdout().match(/New tag:/g).length, 1);
  assert.match(h.stderr(), /suppressed a premature tag announcement/);
  // And it lands after the version was confirmed visible, not before.
  assert.ok(h.stdout().indexOf('verified') < h.stdout().indexOf('New tag:'));
});
