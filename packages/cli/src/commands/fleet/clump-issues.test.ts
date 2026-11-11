// packages/cli/src/commands/fleet/clump-issues.test.ts

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { clumpIssues } from './clumpable-issues';
import {
  BACKLOG_UNAVAILABLE_EXIT_CODE,
  CONSERVATION_BREACH_EXIT_CODE,
  buildGhArgs,
  checkConservation,
  policyFromOptions,
  readBacklog,
  runClumpIssues,
} from './clump-issues';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildGhArgs', () => {
  it('asks gh for the fields the adapter reads — body included', () => {
    // Dropping `body` would leave every issue `unscoped` while the report still
    // looked clean, so the field list is pinned rather than commented.
    expect(buildGhArgs({})).toEqual([
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      '1000',
      '--json',
      'number,title,body,labels,url',
    ]);
  });

  it('passes --state, --limit and --repo through', () => {
    expect(buildGhArgs({ state: 'all', limit: '10', repo: 'o/r' })).toEqual([
      'issue',
      'list',
      '--state',
      'all',
      '--limit',
      '10',
      '--json',
      'number,title,body,labels,url',
      '--repo',
      'o/r',
    ]);
  });
});

describe('readBacklog', () => {
  it('reads a gh dump from a file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clump-issues-'));
    const file = path.join(dir, 'backlog.json');
    fs.writeFileSync(file, JSON.stringify([{ number: 1, title: 't', body: '', labels: [] }]));
    const backlog = readBacklog({ input: file });
    expect(backlog).toEqual([{ number: 1, title: 't', body: '', labels: [] }]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports the gap rather than simulating a queue when the source is unreadable', () => {
    const backlog = readBacklog({ input: path.join(os.tmpdir(), 'no-such-backlog-9f3a.json') });
    expect(backlog).toHaveProperty('gap');
    expect((backlog as { gap: string }).gap).toMatch(/cannot read/);
  });

  it('reports the gap when the dump is not JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clump-issues-'));
    const file = path.join(dir, 'backlog.json');
    fs.writeFileSync(file, 'gh: command not found');
    expect(readBacklog({ input: file })).toEqual({ gap: expect.stringMatching(/not JSON/) });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports the gap when the dump is JSON but not an array', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clump-issues-'));
    const file = path.join(dir, 'backlog.json');
    fs.writeFileSync(file, '{"message":"Bad credentials"}');
    expect(readBacklog({ input: file })).toEqual({ gap: expect.stringMatching(/not an array/) });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('policyFromOptions', () => {
  it('is empty when no flag is set, so the intake defaults apply', () => {
    expect(policyFromOptions({})).toEqual({});
  });

  it('reads the three caps', () => {
    expect(policyFromOptions({ maxClumps: '3', maxPerClump: '5', minToClump: '4' })).toEqual({
      maxClumps: 3,
      maxPerClump: 5,
      minToClump: 4,
    });
  });

  it('ignores an unparseable cap rather than silently clamping to NaN', () => {
    expect(policyFromOptions({ maxClumps: 'lots' })).toEqual({});
  });
});

describe('checkConservation', () => {
  const counts = {
    input: 10,
    clumps: 1,
    clumped: 4,
    floored: 1,
    flooredAct: 0,
    flooredFile: 1,
    overCap: 2,
    ungraded: 2,
    solo: 1,
    conflictSplits: 0,
  };

  it('holds when the five buckets partition the input', () => {
    expect(checkConservation(counts)).toEqual({ holds: true, input: 10, sum: 10 });
  });

  it('FAILS when a bucket loses an item — it is a real check, not a label', () => {
    expect(checkConservation({ ...counts, solo: 0 })).toEqual({ holds: false, input: 10, sum: 9 });
  });
});

/**
 * A backlog dump AND a config beside it, with the config path handed to the
 * run.
 *
 * The config is written even when the test is about something else, and that
 * is deliberate: without `-c`, `resolveConfig` discovers `harness.config.json`
 * by walking up from the CWD, so every assertion here would silently depend
 * on the config of whatever repository the suite happens to run inside — and
 * would start failing the day THIS repo adds a `clumping` block. Pointing
 * each run at a config it owns makes the suite hermetic.
 */
function withDump(
  body: unknown,
  run: (file: string, configPath: string) => void,
  clumping?: unknown
): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clump-issues-'));
  const file = path.join(dir, 'backlog.json');
  const configPath = path.join(dir, 'harness.config.json');
  fs.writeFileSync(file, JSON.stringify(body));
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      name: 'fixture',
      ...(clumping === undefined ? {} : { clumping }),
    })
  );
  try {
    run(file, configPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('runClumpIssues', () => {
  it('exits BACKLOG_UNAVAILABLE and says nothing was simulated when the source fails', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runClumpIssues({ input: path.join(os.tmpdir(), 'no-such-9f3a.json') });
    expect(code).toBe(BACKLOG_UNAVAILABLE_EXIT_CODE);
    expect(err.mock.calls[0]![0]).toMatch(/Nothing was simulated/);
  });

  it('prints the clump set, every shed count, and the conservation arithmetic', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    withDump(
      [
        { number: 1, title: 'a', body: 'packages/cli/src/a.ts', labels: [{ name: 'bug' }] },
        { number: 2, title: 'b', body: 'packages/cli/src/b.ts', labels: [{ name: 'bug' }] },
        { number: 3, title: 'c', body: 'no path', labels: [] },
      ],
      (file, config) => {
        expect(runClumpIssues({ input: file, config })).toBe(0);
      }
    );
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('3 issues, 1 clumps, 2 clumped');
    expect(out).toContain('packages/cli/src/');
    expect(out).toContain('#1 #2');
    expect(out).toContain('untyped (no type label)');
    expect(out).toContain(
      'Conservation holds: 3 = 2 clumped + 0 floored + 0 over-cap + 1 ungraded + 0 solo'
    );
  });

  it('emits JSON carrying the report, the conservation check and the member numbers', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    withDump(
      [
        { number: 1, title: 'a', body: 'packages/cli/src/a.ts', labels: ['bug'] },
        { number: 2, title: 'b', body: 'packages/cli/src/b.ts', labels: ['bug'] },
      ],
      (file, config) => {
        expect(runClumpIssues({ input: file, json: true, config })).toBe(0);
      }
    );
    const payload = JSON.parse(String(log.mock.calls[0]![0])) as {
      report: { issues: number; clumps: number };
      conservation: { holds: boolean };
      clumps: Array<{
        members: Array<{ id: string; ref: { number: number; title: string } }>;
        scope: string;
        kind: string;
      }>;
      individual: number[];
    };
    expect(payload.report.issues).toBe(2);
    expect(payload.conservation.holds).toBe(true);
    expect(payload.clumps).toHaveLength(1);
    // A member is `{ id, ref }`, NOT a bare issue number. `--json`'s own help
    // names this command as a producer for `clump-dispatch --input`, and
    // dispatch keys every commit and every verdict on `member.id`; serialized
    // as numbers, every planned commit subject came out `undefined`. The
    // end-to-end proof is in `clump-dispatch.test.ts`, which now round-trips
    // THIS producer. Here the wire shape itself is pinned.
    expect(payload.clumps[0]!.members).toEqual([
      { id: 'issue-1#0', ref: { number: 1, title: 'a' } },
      { id: 'issue-2#0', ref: { number: 2, title: 'b' } },
    ]);
    expect(payload.clumps[0]!.scope).toBe('packages/cli/src/');
    expect(payload.clumps[0]!.kind).toBe('bug');
    // `individual` and `ungraded` stay NUMBER lists: they are report-only, so
    // nothing dispatches them and the issue number is what a human reads.
    expect(payload.individual).toEqual([]);
  });

  it('exits CONSERVATION_BREACH when the partition does not hold', () => {
    // The breach is unreachable through the real primitive, so the former is
    // injected to prove the exit path is wired rather than decorative: a
    // conservation check whose failure branch nothing can reach is a label, not
    // a gate. The injected former loses exactly one item from `solo`.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const losesOne: typeof clumpIssues = (issues, policy, options) => {
      const out = clumpIssues(issues, policy, options);
      return {
        ...out,
        result: {
          ...out.result,
          counts: { ...out.result.counts, solo: out.result.counts.solo + 1 },
        },
      };
    };
    withDump([{ number: 1, title: 'a', body: 'no path', labels: ['bug'] }], (file, config) => {
      expect(runClumpIssues({ input: file, config }, { clump: losesOne })).toBe(
        CONSERVATION_BREACH_EXIT_CODE
      );
    });
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/CONSERVATION BREACH/);
  });

  it('POSITIVE CONTROL: the same path exits 0 with the real former', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    withDump([{ number: 1, title: 'a', body: 'no path', labels: ['bug'] }], (file, config) => {
      expect(runClumpIssues({ input: file, config })).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: the `clumping` block at the INTAKE seam.
//
// THE PROPERTY: an adopter tunes intake from `harness.config.json` without a
// code change; a project with no block gets the intake baseline it had before
// the block existed (criterion 13); and a flag still beats both.
//
// The intake baseline is the case that makes "absent ⇒ defaults" a non-trivial
// claim here: intake is UNCAPPED by measurement, so "defaults apply" must not
// quietly mean "the primitive's maxClumps of 20 is restored" — on the measured
// 347-issue backlog that would bucket ~300 already-filed issues.
// ─────────────────────────────────────────────────────────────────────────────

describe('the clumping config block reaches the intake seam', () => {
  /** 25 single-issue scopes: 25 would-be work units, well past the primitive's 20. */
  const wide = () =>
    Array.from({ length: 25 }, (_, i) => [
      { number: i * 2 + 1, title: `a${i}`, body: `packages/p${i}/src/a.ts`, labels: ['bug'] },
      { number: i * 2 + 2, title: `b${i}`, body: `packages/p${i}/src/b.ts`, labels: ['bug'] },
    ]).flat();

  function clumpsUnder(clumping?: unknown, flags: Record<string, string> = {}): number {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let out = -1;
    withDump(
      wide(),
      (file, config) => {
        expect(runClumpIssues({ input: file, json: true, config, ...flags })).toBe(0);
        out = (JSON.parse(String(log.mock.calls[0]![0])) as { clumps: unknown[] }).clumps.length;
      },
      clumping
    );
    log.mockRestore();
    return out;
  }

  it('CRITERION 13: no `clumping` block ⇒ the intake baseline, uncapped, and no error', () => {
    // 25 units emitted, NOT 20. If the config path had restored the primitive's
    // default this would read 20 and five already-filed pairs would be bucketed.
    expect(clumpsUnder(undefined)).toBe(25);
    expect(clumpsUnder({})).toBe(25);
  });

  it('POSITIVE CONTROL: a `clumping` block CHANGES the emitted work units', () => {
    expect(clumpsUnder({ maxClumps: 20 })).toBe(20);
  });

  it('a `seams.intake` override wins over the top-level field', () => {
    expect(clumpsUnder({ maxClumps: 20, seams: { intake: { maxClumps: 5 } } })).toBe(5);
  });

  it('a `seams.craft` override does NOT reach the intake seam', () => {
    expect(clumpsUnder({ seams: { craft: { maxClumps: 5 } } })).toBe(25);
  });

  it('a flag still beats the config — the narrower statement wins', () => {
    expect(clumpsUnder({ maxClumps: 20 }, { maxClumps: '3' })).toBe(3);
  });

  it('a MALFORMED block degrades to the baseline rather than failing the command', () => {
    const quiet = vi.spyOn(process.stderr, 'write').mockImplementation((): boolean => true);
    try {
      expect(clumpsUnder({ maxClumps: 'twenty' })).toBe(25);
    } finally {
      quiet.mockRestore();
    }
  });

  it('an unreadable config path is not an error — intake is a read-only report', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    withDump(wide(), (file) => {
      expect(
        runClumpIssues({
          input: file,
          json: true,
          config: path.join(os.tmpdir(), 'no-such-config-9f3a.json'),
        })
      ).toBe(0);
    });
    expect(
      (JSON.parse(String(log.mock.calls[0]![0])) as { clumps: unknown[] }).clumps
    ).toHaveLength(25);
  });
});

/**
 * THE PROPERTY: a config this command DECLINED TO USE must say so.
 *
 * `clump-issues` swallows `resolveConfig`'s `Err` on purpose — it is a
 * read-only report an agent runs from wherever it is standing, and refusing to
 * run for want of a tuning field would be a worse failure than running on
 * defaults. The swallow was defended by a comment claiming the loader "has
 * already reported" a malformed config on stderr. It had not: `resolveConfig`
 * returns `Err(CLIError)` and prints nothing, so a project whose `clumping`
 * block was written CORRECTLY but whose config failed validation somewhere else
 * entirely ran on the baseline with no way to find out.
 *
 * The absent-config silence is the positive control. It is also the case the
 * swallow exists for, so it has to keep working.
 */
describe('a config that exists and does not load is REPORTED', () => {
  let stderr: string[];
  let spy: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderr = [];
    spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown): boolean => (stderr.push(String(chunk)), true));
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
    log.mockRestore();
  });

  /** One issue, one scope: the run always succeeds, so only stderr is under test. */
  const one = [{ number: 1, title: 'a', body: 'packages/p/src/a.ts', labels: ['bug'] }];

  it('names the failing field when the clumping block itself is malformed', () => {
    withDump(
      one,
      (file, config) => {
        expect(runClumpIssues({ input: file, json: true, config })).toBe(0);
      },
      { maxClumps: 0 }
    );
    expect(stderr.join('')).toMatch(/IGNORED WHOLE/);
    expect(stderr.join('')).toContain('clumping.maxClumps');
  });

  it('reports a VALID clumping block lost to an unrelated config error', () => {
    // The case the old comment could not have covered even if the loader did
    // print: the `clumping` block here is perfectly good. The config fails
    // validation elsewhere, and the block goes down with it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clump-issues-badcfg-'));
    const file = path.join(dir, 'backlog.json');
    const config = path.join(dir, 'harness.config.json');
    fs.writeFileSync(file, JSON.stringify(one));
    fs.writeFileSync(config, JSON.stringify({ version: 'one', clumping: { maxClumps: 3 } }));
    try {
      expect(runClumpIssues({ input: file, json: true, config })).toBe(0);
      expect(stderr.join('')).toMatch(/IGNORED WHOLE/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('POSITIVE CONTROL: a loadable config and an ABSENT config are both silent', () => {
    withDump(
      one,
      (file, config) => {
        expect(runClumpIssues({ input: file, json: true, config })).toBe(0);
      },
      { maxClumps: 3 }
    );
    expect(stderr.join('')).toBe('');

    withDump(one, (file) => {
      expect(
        runClumpIssues({
          input: file,
          json: true,
          config: path.join(os.tmpdir(), 'no-such-config-7b21.json'),
        })
      ).toBe(0);
    });
    expect(stderr.join('')).toBe('');
  });
});
