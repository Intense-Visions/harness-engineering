// packages/cli/src/commands/fleet/clump-issues.test.ts

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, vi, afterEach } from 'vitest';

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

describe('runClumpIssues', () => {
  function withDump(body: unknown, run: (file: string) => void): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clump-issues-'));
    const file = path.join(dir, 'backlog.json');
    fs.writeFileSync(file, JSON.stringify(body));
    try {
      run(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

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
      (file) => {
        expect(runClumpIssues({ input: file })).toBe(0);
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
      (file) => {
        expect(runClumpIssues({ input: file, json: true })).toBe(0);
      }
    );
    const payload = JSON.parse(String(log.mock.calls[0]![0])) as {
      report: { issues: number; clumps: number };
      conservation: { holds: boolean };
      clumps: Array<{ members: number[]; scope: string; kind: string }>;
      individual: number[];
    };
    expect(payload.report.issues).toBe(2);
    expect(payload.conservation.holds).toBe(true);
    expect(payload.clumps).toHaveLength(1);
    expect(payload.clumps[0]!.members).toEqual([1, 2]);
    expect(payload.clumps[0]!.scope).toBe('packages/cli/src/');
    expect(payload.clumps[0]!.kind).toBe('bug');
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
    withDump([{ number: 1, title: 'a', body: 'no path', labels: ['bug'] }], (file) => {
      expect(runClumpIssues({ input: file }, { clump: losesOne })).toBe(
        CONSERVATION_BREACH_EXIT_CODE
      );
    });
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/CONSERVATION BREACH/);
  });

  it('POSITIVE CONTROL: the same path exits 0 with the real former', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    withDump([{ number: 1, title: 'a', body: 'no path', labels: ['bug'] }], (file) => {
      expect(runClumpIssues({ input: file })).toBe(0);
    });
  });
});
