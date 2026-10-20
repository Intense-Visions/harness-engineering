#!/usr/bin/env node
/**
 * release-publish.mjs — publish, then PROVE the publish, then tag.
 *
 * Driven by the live incident during the `v13.0.0` release (#2289). npm holds a
 * newly staged version in a VISIBILITY WINDOW during which the registry answers
 * `GET /<name>/<version>` with **404** even though the publish was accepted.
 * Measured on 2026-10-20: `@harness-engineering/stats@0.2.0` staged 15:43:52Z →
 * HTTP 200 at 15:51:57Z (~8 min); `@harness-engineering/linter-gen@0.1.8`
 * staged ~15:46Z → 200 at 15:55:37Z (~9.5 min).
 *
 * Two defects fell out of that window, and this script exists to close both:
 *
 *   1. SELF-COLLISION REPORTED AS FAILURE. `changeset publish` reads the
 *      registry to decide what to publish. Inside the window it sees 404,
 *      concludes "not published", publishes again, and npm rejects the second
 *      attempt with `E409 ... Cannot publish over previously staged version`.
 *      That is the pipeline colliding with its OWN in-flight publish. Nothing
 *      was wrong, yet the job went red. Here that one specific collision is
 *      treated as "already in flight" — success, pending verification. Every
 *      other E409 (notably `Cannot publish over previously published version`,
 *      the real you-already-shipped-this error) still fails the release.
 *
 *   2. TAGS PUSHED AHEAD OF VERIFICATION. `changesets/action` parses
 *      `New tag:  <name>@<version>` lines out of the publish command's STDOUT
 *      and, for each one, runs `git push origin <tag>` AND creates a GitHub
 *      Release — under `ignoreReturnCode: true`, i.e. BEFORE it looks at the
 *      publish command's exit code. (Observed verbatim in the failed attempt:
 *      `ELIFECYCLE Command failed with exit code 1` is immediately followed by
 *      `git push origin @harness-engineering/linter-gen@0.1.8`.) So exiting
 *      non-zero does NOT hold a tag back. The `New tag:` line is the only lever.
 *
 *      Therefore this script runs `changeset publish --no-git-tag` — which
 *      suppresses changesets' own tagging and its `New tag:` lines — polls the
 *      registry until every claimed version answers 200, and only then creates
 *      the tags and emits the `New tag:` lines the action consumes. A tag can no
 *      longer outlive an unverified publish, and `publishedPackages` /
 *      `published` (which the action derives from those same lines) keep their
 *      existing meaning, so the downstream docker + smoke jobs still fire.
 *      As defence in depth, a `New tag:` line arriving from the child is
 *      suppressed rather than relayed: if `--no-git-tag` ever stops working,
 *      the premature announcement must not reach the action.
 *
 * Verification is cheap in the normal case: a version published the ordinary way
 * answers 200 on the first probe — during the incident the nine unaffected
 * packages went live immediately and only the two newly staged ones waited. The
 * 15-minute bound therefore only elapses for a version that genuinely never
 * became visible, which is exactly the silent success this turns into a loud
 * failure.
 *
 * Deliberately NOT built on `npm stage`: the stage-approval queue was empty
 * (`npm stage list --json` → `[]`) throughout the incident while authenticated
 * with `read-write` on both packages. There was never a stage-id, so
 * `npm stage approve` is not the remedy. This is a visibility delay, not a
 * human gate.
 *
 * Usage: node scripts/release-publish.mjs   (invoked by `pnpm release`)
 *
 * Every impure edge (the publish child, the registry read, the clock, the sleep,
 * `git tag`, the two output streams) is an injectable dependency so the
 * behaviour above is unit-testable without a network or a real release — see
 * tests/scripts/release-publish.test.mjs.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Poll budget. The window measured during #2289 was ~8 min and ~9.5 min for the
 * two affected packages; 15 minutes is ~1.6x the worst observed case. It is an
 * upper bound, not a wait — a visible version short-circuits on the first probe.
 */
export const DEFAULT_VERIFY_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_VERIFY_INTERVAL_MS = 30 * 1000;

export const REGISTRY_BASE = 'https://registry.npmjs.org';

/** The ONE E409 that means "our own publish is in flight". */
const STAGED_COLLISION = /Cannot publish over previously staged version "([^"]+)"/;

/**
 * Markers scraped from `changeset publish`'s output.
 *
 * Scraping is the established interface here — `changesets/action` itself
 * derives its `publishedPackages` output by grepping this same stream. But the
 * markers below are chosen to be SINGLE-LINE and stream-independent, which the
 * tempting ones are not: `packages published successfully:` goes to stdout
 * while `packages failed to publish:` goes to stderr and its package list goes
 * back to stdout, so reconstructing either block means relying on interleaving
 * between two pipes that Node does not order. Instead:
 *
 *   - `Publishing "<name>" at "<version>"` (stdout) is logged by
 *     `publishAPackage` exactly once per attempted package, and is the same
 *     `{name, newVersion}` pair changesets later reports.
 *   - `an error occurred while publishing <name>: <code>` (stderr) is logged
 *     once per package whose publish was rejected.
 *
 * attempted − errored is therefore the published set, derived without any
 * cross-stream ordering assumption.
 */
const PUBLISHING = /Publishing "([^"]+)" at "([^"]+)"/;
const PUBLISH_ERROR = /an error occurred while publishing (\S+?):\s*(E\d+)\b/;
const SUCCESS_BLOCK = /packages published successfully:\s*$/;
const FAILURE_BLOCK = /packages failed to publish:\s*$/;
/** A tag announcement from the child — suppressed, never relayed. */
const CHILD_NEW_TAG = /New tag:\s+((?:@[^\s/]+\/)?[^\s@]+)@([^\s]+)/;

const LOG_PREFIX = /^\s*\u{1F98B}\s*/u;
const ANSI = /\[[0-9;]*m/g;

/** @param {string} value */
export function stripAnsi(value) {
  return String(value).replace(ANSI, '');
}

/** @param {{name: string, version: string}} spec */
export function specKey(spec) {
  return `${spec.name}@${spec.version}`;
}

/**
 * Build the registry URL for one exact version. The scope separator is
 * percent-encoded but `@` is left literal — the form confirmed by hand against
 * the live registry during the incident.
 *
 * @param {{name: string, version: string}} spec
 * @param {string} [base]
 */
export function registryUrl(spec, base = REGISTRY_BASE) {
  return `${base}/${spec.name.replace('/', '%2f')}/${spec.version}`;
}

/**
 * Parse `changeset publish`'s output into the facts the classifier needs.
 *
 * @param {string} raw combined stdout+stderr of the publish child
 * @returns {{attempted: {name: string, version: string}[], errored: string[],
 *            stagedCollisions: {name: string, version: string}[],
 *            sawSuccessBlock: boolean, sawFailureBlock: boolean}}
 */
export function parsePublishOutput(raw) {
  /** @type {Map<string, {name: string, version: string}>} */
  const attempted = new Map();
  const errored = [];
  const stagedCollisions = [];
  const seenCollision = new Set();
  let sawSuccessBlock = false;
  let sawFailureBlock = false;
  /** @type {string|null} the package whose npm error output we are inside */
  let errorFor = null;

  for (const rawLine of stripAnsi(raw).split(/\r?\n/)) {
    const line = rawLine.replace(LOG_PREFIX, '').trim();
    if (!line) continue;

    if (SUCCESS_BLOCK.test(line)) {
      sawSuccessBlock = true;
      errorFor = null;
      continue;
    }
    if (FAILURE_BLOCK.test(line)) {
      sawFailureBlock = true;
      errorFor = null;
      continue;
    }

    const publishing = PUBLISHING.exec(line);
    if (publishing) {
      errorFor = null;
      attempted.set(publishing[1], { name: publishing[1], version: publishing[2] });
      continue;
    }

    const failure = PUBLISH_ERROR.exec(line);
    if (failure) {
      if (!errored.includes(failure[1])) errored.push(failure[1]);
      errorFor = failure[1];
      // Fall through: the staged marker is usually on this very line.
    }

    if (errorFor !== null) {
      const staged = STAGED_COLLISION.exec(line);
      if (staged) {
        const spec = { name: errorFor, version: staged[1] };
        const key = specKey(spec);
        // npm repeats the 409 body in its own error dump; record it once.
        if (!seenCollision.has(key)) {
          seenCollision.add(key);
          stagedCollisions.push(spec);
        }
      }
    }
  }

  return {
    attempted: [...attempted.values()],
    errored,
    stagedCollisions,
    sawSuccessBlock,
    sawFailureBlock,
  };
}

/**
 * Decide whether the publish child's result is a real failure, and which
 * versions this run is CLAIMING to have published.
 *
 * `claimed` is what must be proven visible before anything is tagged. On a
 * partial failure the successfully-published packages are still claimed — they
 * are verified and tagged — and the run still fails, loudly, for the packages
 * that genuinely did not go out. Tagging only the proven subset is strictly
 * better than today's behaviour, which tags whatever npm accepted.
 *
 * @param {{exitCode: number, parsed: ReturnType<typeof parsePublishOutput>}} input
 * @returns {{ok: boolean, downgraded: boolean, unparseable: boolean,
 *            claimed: {name: string, version: string}[],
 *            unexplained: {name: string, version: string}[]}}
 */
export function classifyPublish({ exitCode, parsed }) {
  const { attempted, errored, stagedCollisions, sawSuccessBlock, sawFailureBlock } = parsed;

  // FAIL CLOSED on output we could not read. If changesets reported publishing
  // or failing something but no `Publishing "..." at "..."` line was recognised,
  // we cannot name the versions to verify — and a release that tags nothing
  // while reporting success is the silent-success defect all over again.
  if ((sawSuccessBlock || sawFailureBlock) && attempted.length === 0) {
    return { ok: false, downgraded: false, unparseable: true, claimed: [], unexplained: [] };
  }

  const erroredNames = new Set(errored);
  const failed = attempted.filter((spec) => erroredNames.has(spec.name));
  const published = attempted.filter((spec) => !erroredNames.has(spec.name));

  if (exitCode === 0) {
    return {
      ok: true,
      downgraded: false,
      unparseable: false,
      claimed: published,
      unexplained: [],
    };
  }

  // A non-zero exit with no per-package rejection is not a publish rejection at
  // all (changesets crashed, the CLI was mis-invoked, a lifecycle script died).
  // Never downgrade that: there is nothing to attribute it to.
  if (failed.length === 0) {
    return {
      ok: false,
      downgraded: false,
      unparseable: false,
      claimed: published,
      unexplained: [],
    };
  }

  const stagedKeys = new Set(stagedCollisions.map(specKey));
  const unexplained = failed.filter((spec) => !stagedKeys.has(specKey(spec)));
  if (unexplained.length > 0) {
    return {
      ok: false,
      downgraded: false,
      unparseable: false,
      claimed: published,
      unexplained,
    };
  }

  // Every rejection is this pipeline colliding with its own in-flight publish.
  // Claim those versions too; the poll below turns the claim into a fact.
  return {
    ok: true,
    downgraded: true,
    unparseable: false,
    claimed: [...published, ...failed],
    unexplained: [],
  };
}

/**
 * Probe one version once. A transport error is reported as a status-less
 * attempt rather than thrown: a single DNS blip must not abort a 15-minute
 * poll, and "never became visible" is already the failure path.
 *
 * @param {{name: string, version: string}} spec
 * @param {{fetchImpl: typeof fetch, registryBase: string}} deps
 */
async function probe(spec, { fetchImpl, registryBase }) {
  try {
    const response = await fetchImpl(registryUrl(spec, registryBase), {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    return { status: response.status, error: null };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Poll the registry until every spec answers HTTP 200, or the budget elapses.
 *
 * Always probes at least once (the deadline is checked after a round, never
 * before), so even a zero budget performs one read.
 *
 * @param {{name: string, version: string}[]} specs
 * @param {{fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>,
 *          now?: () => number, log?: (line: string) => void,
 *          timeoutMs?: number, intervalMs?: number, registryBase?: string}} [options]
 */
export async function waitForVisibility(specs, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
    now = Date.now,
    log = () => {},
    timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
    intervalMs = DEFAULT_VERIFY_INTERVAL_MS,
    registryBase = REGISTRY_BASE,
  } = options;

  const pending = new Map(specs.map((spec) => [specKey(spec), spec]));
  const verified = [];
  const lastStatus = new Map();
  const deadline = now() + timeoutMs;
  let attempts = 0;

  while (pending.size > 0) {
    attempts += 1;
    for (const [key, spec] of [...pending]) {
      const { status, error } = await probe(spec, { fetchImpl, registryBase });
      lastStatus.set(key, error === null ? `HTTP ${status}` : `network error: ${error}`);
      if (status === 200) {
        pending.delete(key);
        verified.push(spec);
        log(`verified ${key} is visible on the registry (HTTP 200)`);
      } else {
        log(`${key} not visible yet (${lastStatus.get(key)})`);
      }
    }
    if (pending.size === 0) break;
    if (now() >= deadline) break;
    await sleep(intervalMs);
  }

  return { attempts, verified, missing: [...pending.values()], lastStatus };
}

/** Default `git tag` seam. An already-existing tag is reported as a no-op. */
function defaultGitTag(tag) {
  const existing = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    encoding: 'utf8',
  });
  if (existing.status === 0) return { ok: true, created: false };
  const created = spawnSync('git', ['tag', tag], { encoding: 'utf8' });
  if (created.status === 0) return { ok: true, created: true };
  return {
    ok: false,
    created: false,
    error: (created.stderr || created.stdout || '').trim() || `git tag exited ${created.status}`,
  };
}

/** Default publish seam: `changeset publish --no-git-tag`, streamed and captured. */
function defaultRunPublish({ onStdout, onStderr }) {
  const require_ = createRequire(import.meta.url);
  const bin = require_.resolve('@changesets/cli/bin.js');
  return new Promise((settle, reject) => {
    const child = spawn(process.execPath, [bin, 'publish', '--no-git-tag'], {
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.on('error', reject);
    child.on('close', (code) => settle({ exitCode: code ?? 1 }));
  });
}

/**
 * Publish → verify → tag. Returns the process exit code rather than calling
 * `process.exit`, so tests can assert it.
 *
 * @param {{runPublish?: typeof defaultRunPublish, gitTag?: typeof defaultGitTag,
 *          stdout?: (chunk: string) => void, stderr?: (chunk: string) => void,
 *          fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>,
 *          now?: () => number, timeoutMs?: number, intervalMs?: number,
 *          registryBase?: string}} [deps]
 */
export async function runRelease(deps = {}) {
  const {
    runPublish = defaultRunPublish,
    gitTag = defaultGitTag,
    stdout = (chunk) => process.stdout.write(chunk),
    stderr = (chunk) => process.stderr.write(chunk),
    fetchImpl = globalThis.fetch,
    sleep,
    now,
    timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
    intervalMs = DEFAULT_VERIFY_INTERVAL_MS,
    registryBase = REGISTRY_BASE,
  } = deps;

  const note = (line) => stdout(`${line}\n`);
  const seconds = (ms) => Math.round(ms / 1000);
  let captured = '';

  // The child's stdout is relayed line-by-line so a `New tag:` announcement can
  // be withheld (see the header): the action scrapes OUR stdout, so a relayed
  // line would push an unverified tag. The warning goes to stderr, which the
  // action does not read, and never repeats the literal marker.
  let tail = '';
  const relayLine = (line) => {
    const tag = CHILD_NEW_TAG.exec(stripAnsi(line));
    if (tag) {
      stderr(
        `::warning::suppressed a premature tag announcement from changeset publish for ` +
          `${tag[1]}@${tag[2]} — tags are announced only after registry verification. ` +
          `Check that \`--no-git-tag\` is still honoured.\n`
      );
      return;
    }
    stdout(`${line}\n`);
  };
  const onStdout = (chunk) => {
    captured += chunk;
    tail += chunk;
    const lines = tail.split('\n');
    tail = lines.pop() ?? '';
    for (const line of lines) relayLine(line);
  };
  const onStderr = (chunk) => {
    captured += chunk;
    stderr(chunk);
  };

  const { exitCode } = await runPublish({ onStdout, onStderr });
  if (tail.length > 0) {
    relayLine(tail);
    tail = '';
  }

  const parsed = parsePublishOutput(captured);
  const verdict = classifyPublish({ exitCode, parsed });

  if (verdict.downgraded) {
    for (const spec of parsed.stagedCollisions) {
      note(
        `::notice::${specKey(spec)} was rejected with E409 "Cannot publish over previously ` +
          `staged version" — this pipeline colliding with its own in-flight publish, not a ` +
          `failure. Verifying it against the registry before tagging.`
      );
    }
  }

  // Surface a genuine failure BEFORE the poll so the real cause is the first
  // thing in the log, even though the run still verifies and tags whatever did
  // publish before exiting non-zero.
  if (verdict.unparseable) {
    note(
      `::error::changeset publish reported publishing packages but no ` +
        `'Publishing "<name>" at "<version>"' line could be parsed, so there is nothing to ` +
        `verify. Failing closed rather than reporting an unverified release.`
    );
  }
  for (const spec of verdict.unexplained) {
    note(
      `::error::${specKey(spec)} failed to publish for a reason other than a staged-version ` +
        `collision. See the npm error above. The release is failing.`
    );
  }
  if (!verdict.ok && !verdict.unparseable && verdict.unexplained.length === 0) {
    note(
      `::error::the publish command exited ${exitCode} without reporting any per-package ` +
        `failure, so there is nothing to attribute it to. The release is failing.`
    );
  }

  let failedVerification = false;
  const toTag = [];

  if (verdict.claimed.length === 0) {
    note('No versions were claimed as published; nothing to verify or tag.');
  } else {
    note(
      `Verifying ${verdict.claimed.length} claimed version(s) against the registry ` +
        `(bounded at ${seconds(timeoutMs)}s, probing every ${seconds(intervalMs)}s).`
    );
    const result = await waitForVisibility(verdict.claimed, {
      fetchImpl,
      sleep,
      now,
      log: note,
      timeoutMs,
      intervalMs,
      registryBase,
    });
    toTag.push(...result.verified);
    for (const spec of result.missing) {
      failedVerification = true;
      note(
        `::error::${specKey(spec)} never became visible on the registry within ` +
          `${seconds(timeoutMs)}s (last response: ${result.lastStatus.get(specKey(spec))}). ` +
          `It was NOT tagged. Treat this release as incomplete.`
      );
    }
  }

  // Tagging happens only here, only for versions that answered 200. The
  // `New tag:` line is byte-identical to changesets' own, because
  // changesets/action scrapes it with /New tag:\s+(@[^/]+\/[^@]+|[^/]+)@([^\s]+)/
  // and pushes the tag plus a GitHub Release for every match.
  let failedTagging = false;
  for (const spec of toTag) {
    const tag = specKey(spec);
    const result = gitTag(tag);
    if (!result.ok) {
      failedTagging = true;
      note(`::error::could not create git tag ${tag}: ${result.error}`);
      continue;
    }
    stdout(`\u{1F98B}  New tag:  ${tag}\n`);
  }

  if (!verdict.ok || failedVerification || failedTagging) {
    return exitCode !== 0 ? exitCode : 1;
  }
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runRelease().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`::error::release publish failed: ${error?.stack ?? error}\n`);
      process.exit(1);
    }
  );
}
