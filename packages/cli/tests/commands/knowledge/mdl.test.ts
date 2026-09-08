/**
 * Characterization tests for `harness knowledge mdl` (#1630) — the Minimum
 * Description Length scorer over the learnings store.
 *
 * These pin the CURRENT behaviour of the command as-is. Where the behaviour is
 * surprising it is pinned, not corrected: the source is not touched by this
 * suite, and the surprises are called out in comments marked CHARACTERIZATION.
 *
 * Scope is the command layer driven end-to-end against a real on-disk learnings
 * store and a real telemetry file, so the MDL arithmetic in the report is the
 * scorer's own rather than a mock's. The command is only observable through
 * three channels — stdout, stderr, and the exit code it hands the shell — so
 * every assertion here is on one of those three.
 *
 * Ledger rows are matched with `ledgerRow()` rather than the literal padded
 * string: the label-to-value pairing is the contract, the column width is
 * layout, and a test that breaks on a cosmetic realignment was never testing
 * behaviour (TEST-R002 / TEST-R007).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { createMdlCommand } from '../../../src/commands/knowledge/mdl';
import { captureConsole, stubProcessExit, runToExit } from '../cli-command-harness';

interface MdlRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Parse `argv` through the real command, mounted under a parent that supplies
 * the `--json` global the action reads via `optsWithGlobals()`.
 *
 * `runToExit` fails loudly if the action returns without exiting — "always
 * terminates the process" is part of this command's contract, and a silent
 * return would make every `exitCode` assertion below vacuous.
 */
async function runMdl(argv: string[], globals: string[] = []): Promise<MdlRun> {
  const cap = captureConsole();
  const exit = stubProcessExit();
  try {
    const parent = new Command();
    parent.exitOverride();
    parent.option('--json', 'JSON output');
    parent.addCommand(createMdlCommand());
    const exitCode = await runToExit(() =>
      parent.parseAsync([...globals, 'mdl', ...argv], { from: 'user' })
    );
    return { exitCode, stdout: cap.stdout(), stderr: cap.stderr() };
  } finally {
    exit.restore();
    cap.restore();
  }
}

const tmpDirs: string[] = [];

function tmpdir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mdl-'));
  tmpDirs.push(dir);
  return dir;
}

/** A project root whose `.harness/learnings.md` holds `learnings` (omit for none). */
function project(learnings?: string): string {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, '.harness'), { recursive: true });
  if (learnings !== undefined) {
    fs.writeFileSync(path.join(dir, '.harness', 'learnings.md'), learnings);
  }
  return dir;
}

function telemetryFile(contents: unknown): string {
  const file = path.join(tmpdir(), 'telemetry.json');
  fs.writeFileSync(file, JSON.stringify(contents));
  return file;
}

/** The store's entry identity: sha256 of the trimmed block, first 8 hex chars. */
function entryId(block: string): string {
  return crypto.createHash('sha256').update(block.trim()).digest('hex').slice(0, 8);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match one ledger row by its label and value, tolerant of the column padding
 * that aligns the values. Pins the contract (this label reports this number)
 * without pinning the renderer's alignment.
 */
function ledgerRow(label: string, value: string): RegExp {
  return new RegExp(`^ *${escapeRegExp(label)} +${escapeRegExp(value)}$`, 'm');
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tmpDirs.length > 0) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

const BULLET_A =
  '- **2026-01-01** [skill:harness-tdd] Rebuild better-sqlite3 from source under Node 22.';
const BULLET_B =
  '- **2026-01-02** [skill:harness-tdd] Prefer absolute paths inside fleet lane worktrees.';
const TWO_ENTRIES = ['# Learnings', '', BULLET_A, BULLET_B, ''].join('\n');

/**
 * Telemetry for `id` with three present and three absent runs in one stratum —
 * the minimum the default config accepts as sufficient evidence (>= 3 present,
 * >= 3 absent, >= 2 per cell, >= 1 matched stratum). Each inclusion ships 100
 * tokens, so the entry's description length is 300.
 */
function telemetryFor(id: string, presentCost: number, absentCost: number): unknown {
  return {
    inclusions: [
      { entryId: id, runId: 'p1', tokensShipped: 100 },
      { entryId: id, runId: 'p2', tokensShipped: 100 },
      { entryId: id, runId: 'p3', tokensShipped: 100 },
    ],
    outcomes: [
      { runId: 'p1', stratum: 'feature', cost: presentCost },
      { runId: 'p2', stratum: 'feature', cost: presentCost },
      { runId: 'p3', stratum: 'feature', cost: presentCost },
      { runId: 'a1', stratum: 'feature', cost: absentCost },
      { runId: 'a2', stratum: 'feature', cost: absentCost },
      { runId: 'a3', stratum: 'feature', cost: absentCost },
    ],
  };
}

describe('harness knowledge mdl', () => {
  describe('scoring a store with no telemetry', () => {
    it('scores every learnings entry in the store', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)]);
      expect(run.stdout).toMatch(ledgerRow('entries scored', '2'));
    });

    it('exits 0 when a populated store scored without telemetry', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)]);
      expect(run.exitCode).toBe(0);
    });

    it('retains every entry as insufficient-evidence rather than pruning on missing data', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)]);
      expect(run.stdout).toMatch(ledgerRow('insufficient evidence', '2 (retained by default)'));
    });

    it('explains that absent telemetry is measurement absence, not measured worthlessness', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)]);
      expect(run.stdout).toContain('No inclusion/outcome telemetry supplied (--telemetry)');
    });

    it('reports a zero measured value when nothing was measured', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)]);
      expect(run.stdout).toMatch(ledgerRow('total measured value', '0 tokens'));
    });

    it('recommends nothing when there is no evidence to recommend on', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)]);
      expect(run.stdout).toContain('No prune or merge candidates.');
    });
  });

  describe('an absent learnings store', () => {
    it('scores zero entries instead of failing', async () => {
      const run = await runMdl(['--path', project()]);
      expect(run.stdout).toMatch(ledgerRow('entries scored', '0'));
    });

    it('exits 0 when the store does not exist — an empty store is not an error', async () => {
      const run = await runMdl(['--path', project()]);
      expect(run.exitCode).toBe(0);
    });
  });

  describe('with matched inclusion/outcome telemetry', () => {
    /** Entry A pays rent: present runs cost 100, absent runs cost 500. */
    function paysRent(): { dir: string; telemetry: string } {
      return {
        dir: project(TWO_ENTRIES),
        telemetry: telemetryFile(telemetryFor(entryId(BULLET_A), 100, 500)),
      };
    }

    it('sums the measured value across the runs the entry was present in', async () => {
      const { dir, telemetry } = paysRent();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      // value/run = mean(absent 500) - mean(present 100) = 400, over 3 present runs.
      expect(run.stdout).toMatch(ledgerRow('total measured value', '1200 tokens'));
    });

    it('charges the description length actually shipped by the inclusions', async () => {
      const { dir, telemetry } = paysRent();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      expect(run.stdout).toMatch(ledgerRow('total description length', '300 tokens'));
    });

    it('reports the net store MDL as measured value minus description length', async () => {
      const { dir, telemetry } = paysRent();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      expect(run.stdout).toMatch(ledgerRow('net store MDL', '900 tokens'));
    });

    it('drops the no-telemetry advisory once inclusions are supplied', async () => {
      const { dir, telemetry } = paysRent();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      // One assertion, deliberately structural: it proves the ledger rendered AND
      // that no advisory paragraph sits between its last row and the candidate
      // section. A bare `not.toContain` would also pass on empty stdout.
      expect(run.stdout).toMatch(
        /^ *insufficient evidence +1 \(retained by default\)\n\n +No prune or merge candidates\.$/m
      );
    });

    it('leaves the un-included entry counted as insufficient evidence', async () => {
      const { dir, telemetry } = paysRent();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      expect(run.stdout).toMatch(ledgerRow('insufficient evidence', '1 (retained by default)'));
    });

    it('recommends no prune for an entry that pays rent', async () => {
      const { dir, telemetry } = paysRent();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      expect(run.stdout).toContain('No prune or merge candidates.');
    });
  });

  describe('an entry measured to cost more than it saves', () => {
    /** Entry A taxes: present runs cost 500, absent runs cost 100. */
    function taxes(): { dir: string; telemetry: string } {
      return {
        dir: project(TWO_ENTRIES),
        telemetry: telemetryFile(telemetryFor(entryId(BULLET_A), 500, 100)),
      };
    }

    it('lists it under the reversible-tombstone prune plan', async () => {
      const { dir, telemetry } = taxes();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      expect(run.stdout).toContain('Pending prune candidates (reversible tombstone plan):');
    });

    it('names the entry and its net token cost', async () => {
      const { dir, telemetry } = taxes();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      expect(run.stdout).toMatch(new RegExp(`^ *${entryId(BULLET_A)} +net -1500 tokens — `, 'm'));
    });

    it('carries the measured rationale rather than a bare verdict', async () => {
      const { dir, telemetry } = taxes();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      expect(run.stdout).toContain('measured net cost: taxes 300 tokens, saves -1200');
    });

    it('exits 0 even when it recommends a prune — the report never deletes', async () => {
      const { dir, telemetry } = taxes();
      const run = await runMdl(['--path', dir, '--telemetry', telemetry]);
      expect(run.exitCode).toBe(0);
    });
  });

  describe('overlapping entries', () => {
    // The merge detector clusters on `checkOverlap`, whose 0.7 threshold is a
    // weighted sum over five dimensions. Three of them (structural, rootCause,
    // codeReference) score 0 unless BOTH entries carry the corresponding tag or
    // file reference, so a merge candidate needs a fully-tagged, file-citing,
    // same-day pair. These two differ only in a trailing word.
    const TAGGED_A =
      '- **2026-01-01** [skill:harness-tdd] [outcome:success] [root_cause:node-abi] ' +
      'Rebuild better-sqlite3 from source under Node 22 before running packages/cli/tests/setup.ts.';
    const TAGGED_B = `${TAGGED_A.slice(0, -1)} locally.`;
    const tagged = (): string => [TAGGED_A, TAGGED_B, ''].join('\n');

    it('reports a fully-tagged near-duplicate pair as a merge/consolidate candidate', async () => {
      const run = await runMdl(['--path', project(tagged())]);
      expect(run.stdout).toContain('Pending merge/consolidate candidates:');
    });

    it('names both entries in the candidate cluster', async () => {
      const run = await runMdl(['--path', project(tagged())]);
      const ids = [entryId(TAGGED_A), entryId(TAGGED_B)].sort();
      expect(run.stdout).toContain(`${ids[0]} + ${ids[1]}`);
    });

    it('quantifies the saving as sum minus union description length', async () => {
      const run = await runMdl(['--path', project(tagged())]);
      expect(run.stdout).toMatch(/saves \d+ tokens \(union \d+ < sum \d+, overlap \d\.\d\d\)/);
    });

    it('reports the union as strictly cheaper than the sum it replaces', async () => {
      const run = await runMdl(['--path', project(tagged())], ['--json']);
      const candidate = JSON.parse(run.stdout).mergeCandidates[0];
      expect(candidate.unionDescriptionLength).toBeLessThan(candidate.sumDescriptionLength);
    });

    // CHARACTERIZATION (see PARK in the PR body): untagged prose can never reach
    // the 0.7 threshold. Lexical (0.3) and temporal (0.1) are the only
    // dimensions an untagged entry can score on, so even a same-day pair that is
    // lexically identical tops out at 0.4 and is never recommended for
    // consolidation. Pinned as-is, not corrected.
    it('never recommends consolidating untagged prose duplicates, however similar', async () => {
      const PLAIN_A =
        '- **2026-02-01** Rebuild better-sqlite3 from source before running the suite.';
      const PLAIN_B =
        '- **2026-02-01** Rebuild better-sqlite3 from source before running the suites.';
      const run = await runMdl(['--path', project([PLAIN_A, PLAIN_B, ''].join('\n'))]);
      expect(run.stdout).toContain('No prune or merge candidates.');
    });
  });

  describe('--json', () => {
    it('emits the scored report as JSON', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)], ['--json']);
      expect(JSON.parse(run.stdout).entryCount).toBe(2);
    });

    it('marks the report as report-only', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)], ['--json']);
      expect(JSON.parse(run.stdout).reportOnly).toBe(true);
    });

    it('carries a per-entry verdict for every scored entry', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)], ['--json']);
      expect(JSON.parse(run.stdout).scores.map((s: { verdict: string }) => s.verdict)).toEqual([
        'insufficient-evidence',
        'insufficient-evidence',
      ]);
    });

    it('emits the JSON document alone, with no human ledger around it', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES)], ['--json']);
      expect(run.stdout.trim()).toMatch(/^\{[\s\S]*\}$/);
    });

    it('states the reversal for every prune candidate', async () => {
      const dir = project(TWO_ENTRIES);
      const telemetry = telemetryFile(telemetryFor(entryId(BULLET_A), 500, 100));
      const run = await runMdl(['--path', dir, '--telemetry', telemetry], ['--json']);
      expect(JSON.parse(run.stdout).pruneCandidates[0].reversal).toBe('restore-from-tombstone');
    });
  });

  describe('malformed or missing telemetry', () => {
    // Each failure mode is pinned by a pair: one test on the exit code, one on
    // the stderr text that explains it. Split rather than combined so a wrong
    // exit code and a missing diagnostic are distinguishable in the report.
    function absentTelemetry(): string[] {
      return ['--path', project(TWO_ENTRIES), '--telemetry', path.join(tmpdir(), 'absent.json')];
    }

    function unparseableTelemetry(): string[] {
      const file = path.join(tmpdir(), 'telemetry.json');
      fs.writeFileSync(file, 'not json at all');
      return ['--path', project(TWO_ENTRIES), '--telemetry', file];
    }

    it('exits 2 when the telemetry file does not exist', async () => {
      const run = await runMdl(absentTelemetry());
      expect(run.exitCode).toBe(2);
    });

    it('reports the missing file on stderr rather than dying silently', async () => {
      const run = await runMdl(absentTelemetry());
      expect(run.stderr).toContain('ENOENT');
    });

    it('exits 2 when the telemetry file is not valid JSON', async () => {
      const run = await runMdl(unparseableTelemetry());
      expect(run.exitCode).toBe(2);
    });

    it('surfaces the parse failure on stderr', async () => {
      const run = await runMdl(unparseableTelemetry());
      // Deliberately not pinning V8's exact wording, which has changed across
      // Node majors; stderr is otherwise empty, so /JSON/ is specific here.
      expect(run.stderr).toMatch(/JSON/);
    });

    it('treats a non-array inclusions field as no inclusions instead of throwing', async () => {
      const telemetry = telemetryFile({ inclusions: 'nope', outcomes: 'nope' });
      const run = await runMdl(['--path', project(TWO_ENTRIES), '--telemetry', telemetry]);
      expect(run.exitCode).toBe(0);
    });

    it('falls back to the insufficient-evidence advisory for a non-array inclusions field', async () => {
      const telemetry = telemetryFile({ inclusions: 'nope', outcomes: 'nope' });
      const run = await runMdl(['--path', project(TWO_ENTRIES), '--telemetry', telemetry]);
      expect(run.stdout).toContain('No inclusion/outcome telemetry supplied (--telemetry)');
    });

    // CHARACTERIZATION (see PARK in the PR body): `hasTelemetry` is derived from
    // `inclusions.length > 0` alone, so a telemetry file that carries outcomes
    // but no inclusions is reported as though `--telemetry` was never passed.
    // The advisory names the flag the operator did in fact supply. Pinned as-is.
    it('claims no telemetry was supplied when the file carries outcomes but no inclusions', async () => {
      const telemetry = telemetryFile({
        inclusions: [],
        outcomes: [{ runId: 'a1', stratum: 'feature', cost: 10 }],
      });
      const run = await runMdl(['--path', project(TWO_ENTRIES), '--telemetry', telemetry]);
      expect(run.stdout).toContain('No inclusion/outcome telemetry supplied (--telemetry)');
    });
  });

  describe('--stream', () => {
    it('exits 2 when the named stream does not exist', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES), '--stream', 'ghost']);
      expect(run.exitCode).toBe(2);
    });

    it('names the unknown stream on stderr', async () => {
      const run = await runMdl(['--path', project(TWO_ENTRIES), '--stream', 'ghost']);
      expect(run.stderr).toContain("Stream 'ghost' not found");
    });

    it('scores the stream-scoped store, not the project-root store', async () => {
      // The root store holds two entries and the stream store holds one, so a
      // count of 1 can only come from the stream having been resolved.
      const dir = project(TWO_ENTRIES);
      const streams = path.join(dir, '.harness', 'streams');
      fs.mkdirSync(path.join(streams, 'alpha'), { recursive: true });
      fs.writeFileSync(
        path.join(streams, 'index.json'),
        JSON.stringify({
          schemaVersion: 1,
          activeStream: null,
          streams: {
            alpha: { name: 'alpha', createdAt: '2026-01-01', lastActiveAt: '2026-01-01' },
          },
        })
      );
      fs.writeFileSync(path.join(streams, 'alpha', 'learnings.md'), `${BULLET_A}\n`);
      const run = await runMdl(['--path', dir, '--stream', 'alpha']);
      expect(run.stdout).toMatch(ledgerRow('entries scored', '1'));
    });
  });

  describe('path resolution', () => {
    it('defaults --path to the process working directory', async () => {
      const dir = project(TWO_ENTRIES);
      vi.spyOn(process, 'cwd').mockReturnValue(dir);
      const run = await runMdl([]);
      expect(run.stdout).toMatch(ledgerRow('entries scored', '2'));
    });

    // CHARACTERIZATION (see PARK in the PR body): `--telemetry` is resolved with
    // `path.resolve()` against the process cwd, NOT against `--path`. Pointing
    // `--path` at another project therefore does not relocate the telemetry
    // lookup. Pinned as-is: were it resolved against `--path`, this run would
    // fail ENOENT and exit 2 instead of scoring.
    it('resolves a relative --telemetry against the cwd, not against --path', async () => {
      const dir = project(TWO_ENTRIES);
      const elsewhere = tmpdir();
      fs.writeFileSync(
        path.join(elsewhere, 'telemetry.json'),
        JSON.stringify(telemetryFor(entryId(BULLET_A), 100, 500))
      );
      vi.spyOn(process, 'cwd').mockReturnValue(elsewhere);
      const run = await runMdl(['--path', dir, '--telemetry', 'telemetry.json']);
      expect(run.stdout).toMatch(ledgerRow('total measured value', '1200 tokens'));
    });
  });
});
