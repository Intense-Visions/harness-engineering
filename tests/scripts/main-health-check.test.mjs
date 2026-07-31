/**
 * Tests for the `main` CI health alarm (issue #987).
 *
 * These cover the three properties that make the alarm trustworthy:
 *
 *   1. The quiet rule — one failure is a flake, N consecutive failures is an
 *      outage — and `cancelled` runs never count either way (CI cancels
 *      in-progress runs on rapid merges).
 *   2. Transition-only notification — open on green -> red, edit in place while
 *      still red (never a second issue), all-clear on red -> green.
 *   3. Denominator discipline — resolving fewer decisive runs than the rule
 *      needs is INDETERMINATE, never healthy. A check that examined nothing
 *      has abstained.
 *
 * `gh` is injected as a fake, so nothing here touches the network.
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXIT,
  ALARM_LABEL,
  ALARM_MARKER,
  selectDecisiveRuns,
  evaluateHealth,
  decideAction,
  renderSummary,
  renderIssueBody,
  fetchRuns,
  findOpenAlarmIssue,
  deliverAlarm,
} from '../../scripts/main-health-check.mjs';

/** @param {string} conclusion @param {string} date */
function run(conclusion, date, extra = {}) {
  return {
    status: 'completed',
    conclusion,
    created_at: date,
    html_url: `https://example.test/${date}`,
    display_title: `commit at ${date}`,
    ...extra,
  };
}

/** Records the `gh` argv it was called with and replays canned stdout. */
function fakeGh(responses = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    for (const [key, value] of Object.entries(responses)) {
      if (args.join(' ').includes(key)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    return '';
  };
  gh.calls = calls;
  return gh;
}

// --------------------------------------------------------------------------
// Exit-code contract
// --------------------------------------------------------------------------

test('main-health: exit codes are distinct and INDETERMINATE is not zero', () => {
  const codes = Object.values(EXIT);
  assert.equal(new Set(codes).size, codes.length, 'exit codes must be unique');
  assert.equal(EXIT.HEALTHY, 0);
  assert.notEqual(EXIT.INDETERMINATE, EXIT.HEALTHY);
  assert.notEqual(EXIT.INDETERMINATE, EXIT.UNHEALTHY);
  assert.ok(EXIT.INDETERMINATE > 0, 'abstaining must never be reported as success');
});

// --------------------------------------------------------------------------
// Decisive-run selection
// --------------------------------------------------------------------------

test('main-health: cancelled and skipped runs are not health signals', () => {
  const decisive = selectDecisiveRuns([
    run('cancelled', '2026-07-27T00:00:00Z'),
    run('skipped', '2026-07-26T00:00:00Z'),
    run('failure', '2026-07-25T00:00:00Z'),
    { status: 'in_progress', conclusion: null, created_at: '2026-07-28T00:00:00Z' },
  ]);
  assert.equal(decisive.length, 1);
  assert.equal(decisive[0].conclusion, 'failure');
});

test('main-health: decisive runs are ordered newest first regardless of input order', () => {
  const decisive = selectDecisiveRuns([
    run('failure', '2026-07-20T00:00:00Z'),
    run('success', '2026-07-25T00:00:00Z'),
    run('failure', '2026-07-23T00:00:00Z'),
  ]);
  assert.deepEqual(
    decisive.map((r) => r.created_at),
    ['2026-07-25T00:00:00Z', '2026-07-23T00:00:00Z', '2026-07-20T00:00:00Z']
  );
});

test('main-health: timed_out and startup_failure count as failures', () => {
  const verdict = evaluateHealth([
    run('timed_out', '2026-07-27T00:00:00Z'),
    run('startup_failure', '2026-07-26T00:00:00Z'),
    run('success', '2026-07-25T00:00:00Z'),
  ]);
  assert.equal(verdict.state, 'unhealthy');
  assert.equal(verdict.failingStreak, 2);
});

// --------------------------------------------------------------------------
// The quiet rule
// --------------------------------------------------------------------------

test('main-health: a single failure after a green run is a flake, not an alarm', () => {
  const verdict = evaluateHealth([
    run('failure', '2026-07-27T00:00:00Z'),
    run('success', '2026-07-26T00:00:00Z'),
    run('success', '2026-07-25T00:00:00Z'),
  ]);
  assert.equal(verdict.state, 'healthy');
  assert.equal(verdict.failingStreak, 1);
  assert.match(verdict.reason, /flake/);
});

test('main-health: two consecutive failures trip the alarm', () => {
  const verdict = evaluateHealth([
    run('failure', '2026-07-27T00:00:00Z'),
    run('failure', '2026-07-26T00:00:00Z'),
    run('success', '2026-07-25T00:00:00Z'),
  ]);
  assert.equal(verdict.state, 'unhealthy');
  assert.equal(verdict.failingStreak, 2);
  assert.equal(verdict.streakRuns.length, 2);
});

test('main-health: cancelled runs interleaved in a red streak do not break it', () => {
  // The real #987 shape: concurrency-cancelled runs sit between real failures.
  const verdict = evaluateHealth([
    run('failure', '2026-07-27T00:00:00Z'),
    run('cancelled', '2026-07-26T12:00:00Z'),
    run('failure', '2026-07-26T00:00:00Z'),
    run('success', '2026-07-22T00:00:00Z'),
  ]);
  assert.equal(verdict.state, 'unhealthy');
  assert.equal(verdict.failingStreak, 2);
});

test('main-health: a green most-recent run is healthy even with older failures', () => {
  const verdict = evaluateHealth([
    run('success', '2026-07-27T00:00:00Z'),
    run('failure', '2026-07-26T00:00:00Z'),
    run('failure', '2026-07-25T00:00:00Z'),
  ]);
  assert.equal(verdict.state, 'healthy');
  assert.equal(verdict.failingStreak, 0);
});

test('main-health: the threshold is configurable and a strictly quieter rule alarms later', () => {
  const runs = [
    run('failure', '2026-07-27T00:00:00Z'),
    run('failure', '2026-07-26T00:00:00Z'),
    run('success', '2026-07-25T00:00:00Z'),
  ];
  assert.equal(evaluateHealth(runs, { threshold: 2 }).state, 'unhealthy');
  assert.equal(evaluateHealth(runs, { threshold: 3 }).state, 'healthy');
});

// --------------------------------------------------------------------------
// Denominator discipline
// --------------------------------------------------------------------------

test('main-health: zero runs is INDETERMINATE, never healthy', () => {
  const verdict = evaluateHealth([]);
  assert.equal(verdict.state, 'indeterminate');
  assert.equal(verdict.decisiveCount, 0);
  assert.match(verdict.reason, /Zero decisive runs/);
});

test('main-health: a run list of only cancelled runs resolves zero and abstains', () => {
  const verdict = evaluateHealth([
    run('cancelled', '2026-07-27T00:00:00Z'),
    run('cancelled', '2026-07-26T00:00:00Z'),
  ]);
  assert.equal(verdict.state, 'indeterminate');
  assert.equal(verdict.decisiveCount, 0);
});

test('main-health: fewer decisive runs than the threshold abstains rather than guessing', () => {
  const verdict = evaluateHealth([run('failure', '2026-07-27T00:00:00Z')], { threshold: 2 });
  assert.equal(verdict.state, 'indeterminate');
  assert.match(verdict.reason, /needs 2/);
});

test('main-health: a malformed API response throws so the caller can abstain', () => {
  const gh = fakeGh({ 'actions/workflows': '{"not_what_we_expected": true}' });
  assert.throws(
    () => fetchRuns({ gh, repo: 'o/r', workflow: 'ci.yml', branch: 'main', lookback: 5 }),
    /workflow_runs/
  );
});

test('main-health: an API failure propagates rather than resolving as empty-and-healthy', () => {
  const gh = fakeGh({ 'actions/workflows': new Error('gh: HTTP 404 Not Found') });
  assert.throws(
    () => fetchRuns({ gh, repo: 'o/r', workflow: 'nope.yml', branch: 'main', lookback: 5 }),
    /404/
  );
});

test('main-health: the run query is scoped to push events on the watched branch', () => {
  const gh = fakeGh({ 'actions/workflows': '{"workflow_runs": []}' });
  fetchRuns({ gh, repo: 'o/r', workflow: 'ci.yml', branch: 'main', lookback: 30 });
  assert.equal(gh.calls[0][0], 'api');
  const path = gh.calls[0][1];
  assert.match(path, /\/repos\/o\/r\/actions\/workflows\/ci\.yml\/runs/);
  assert.match(path, /branch=main/);
  assert.match(path, /event=push/);
  assert.match(path, /per_page=30/);
});

// --------------------------------------------------------------------------
// Transition-only alarming
// --------------------------------------------------------------------------

test('main-health: green -> red opens an issue; still-red only updates it', () => {
  assert.equal(decideAction('unhealthy', false), 'open');
  assert.equal(decideAction('unhealthy', true), 'update');
});

test('main-health: red -> green resolves; steady green does nothing', () => {
  assert.equal(decideAction('healthy', true), 'resolve');
  assert.equal(decideAction('healthy', false), 'none');
});

test('main-health: an abstaining check never opens nor closes an alarm', () => {
  assert.equal(decideAction('indeterminate', false), 'none');
  assert.equal(decideAction('indeterminate', true), 'none');
});

test('main-health: an already-open alarm is edited in place, not duplicated', () => {
  const gh = fakeGh();
  const verdict = evaluateHealth([
    run('failure', '2026-07-27T00:00:00Z'),
    run('failure', '2026-07-26T00:00:00Z'),
  ]);
  const result = deliverAlarm({
    gh,
    repo: 'o/r',
    workflow: 'ci.yml',
    branch: 'main',
    action: 'update',
    verdict,
    issue: { number: 42 },
  });
  assert.equal(result.delivered, true);
  assert.equal(result.issueNumber, 42);
  const verbs = gh.calls.map((c) => c.slice(0, 2).join(' '));
  assert.ok(verbs.includes('issue edit'), 'should edit the existing issue');
  assert.ok(!verbs.includes('issue create'), 'must never open a second alarm issue');
  assert.ok(!verbs.includes('issue comment'), 'must not nag with a comment every run');
});

test('main-health: opening an alarm labels it and returns the parsed issue number', () => {
  const gh = fakeGh({ 'issue create': 'https://github.com/o/r/issues/1234\n' });
  const verdict = evaluateHealth([
    run('failure', '2026-07-27T00:00:00Z'),
    run('failure', '2026-07-26T00:00:00Z'),
  ]);
  const result = deliverAlarm({
    gh,
    repo: 'o/r',
    workflow: 'ci.yml',
    branch: 'main',
    action: 'open',
    verdict,
    issue: null,
  });
  assert.equal(result.issueNumber, 1234);
  const create = gh.calls.find((c) => c[0] === 'issue' && c[1] === 'create');
  assert.ok(create.includes(ALARM_LABEL), 'alarm issue must carry the lookup label');
});

test('main-health: resolving comments an all-clear and then closes', () => {
  const gh = fakeGh();
  const verdict = evaluateHealth([
    run('success', '2026-07-28T00:00:00Z'),
    run('success', '2026-07-27T00:00:00Z'),
  ]);
  deliverAlarm({
    gh,
    repo: 'o/r',
    workflow: 'ci.yml',
    branch: 'main',
    action: 'resolve',
    verdict,
    issue: { number: 42 },
  });
  const verbs = gh.calls.map((c) => c.slice(0, 2).join(' '));
  assert.deepEqual(verbs, ['issue comment', 'issue close']);
});

test('main-health: a failed issue upsert reports undelivered rather than swallowing it', () => {
  const gh = fakeGh({ 'issue edit': new Error('HTTP 403: Resource not accessible') });
  const verdict = evaluateHealth([
    run('failure', '2026-07-27T00:00:00Z'),
    run('failure', '2026-07-26T00:00:00Z'),
  ]);
  const result = deliverAlarm({
    gh,
    repo: 'o/r',
    workflow: 'ci.yml',
    branch: 'main',
    action: 'update',
    verdict,
    issue: { number: 42 },
  });
  assert.equal(result.delivered, false);
  assert.match(result.error, /403/);
});

test('main-health: a dry run performs no writes', () => {
  const gh = fakeGh();
  const verdict = evaluateHealth([
    run('failure', '2026-07-27T00:00:00Z'),
    run('failure', '2026-07-26T00:00:00Z'),
  ]);
  deliverAlarm({
    gh,
    repo: 'o/r',
    workflow: 'ci.yml',
    branch: 'main',
    action: 'open',
    verdict,
    issue: null,
    dryRun: true,
  });
  assert.deepEqual(gh.calls, []);
});

test('main-health: the open alarm is found by label and the lowest number wins', () => {
  const gh = fakeGh({ 'issue list': '[{"number": 90, "title": "b"}, {"number": 42, "title": "a"}]' });
  const found = findOpenAlarmIssue({ gh, repo: 'o/r' });
  assert.equal(found.number, 42);
  assert.ok(gh.calls[0].includes('--label'));
  assert.ok(gh.calls[0].includes(ALARM_LABEL));
});

test('main-health: a missing label reads as no open alarm rather than crashing', () => {
  const gh = fakeGh({ 'issue list': new Error('could not find any label named main-health-alarm') });
  assert.equal(findOpenAlarmIssue({ gh, repo: 'o/r' }), null);
});

// --------------------------------------------------------------------------
// Reporting — the summary must exist and show its denominator every run
// --------------------------------------------------------------------------

test('main-health: the summary states the denominator on every verdict', () => {
  const ctx = { repo: 'o/r', workflow: 'ci.yml', branch: 'main', issueNumber: null };
  for (const runs of [
    [run('success', '2026-07-28T00:00:00Z'), run('success', '2026-07-27T00:00:00Z')],
    [run('failure', '2026-07-28T00:00:00Z'), run('failure', '2026-07-27T00:00:00Z')],
    [],
  ]) {
    const verdict = evaluateHealth(runs);
    const summary = renderSummary(verdict, decideAction(verdict.state, false), ctx);
    assert.match(summary, /Decisive runs resolved \| \*\*\d+\*\*/);
    assert.match(summary, /Verdict:/);
  }
});

test('main-health: an abstained summary is not labelled as a pass', () => {
  const summary = renderSummary(evaluateHealth([]), 'none', {
    repo: 'o/r',
    workflow: 'ci.yml',
    branch: 'main',
    issueNumber: null,
  });
  assert.match(summary, /INDETERMINATE/);
  assert.match(summary, /not a pass/);
  assert.ok(!/HEALTHY/.test(summary.split('\n')[0]), 'the headline must not read healthy');
});

test('main-health: the issue body carries the marker, the streak, and the #987 rationale', () => {
  const verdict = evaluateHealth([
    run('failure', '2026-07-27T00:00:00Z'),
    run('failure', '2026-07-26T00:00:00Z'),
  ]);
  const body = renderIssueBody(verdict, { repo: 'o/r', workflow: 'ci.yml', branch: 'main' });
  assert.ok(body.startsWith(ALARM_MARKER));
  assert.match(body, /2026-07-27T00:00:00Z/);
  assert.match(body, /#987/);
});
