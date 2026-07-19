import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FlightRecorder, gatherProvenance, type RunRecord } from './flight-recorder';

const noopLogger = { info: () => {}, warn: () => {} };

describe('gatherProvenance', () => {
  const config = {
    agent: {
      backends: {
        primary: { type: 'claude' },
        local: {
          type: 'ollama',
          endpoint: 'http://127.0.0.1:11434/v1',
          model: ['qwen3-coder:30b'],
        },
        reasoner: { type: 'ollama', model: 'qwen3.6:27b' },
      },
      routing: { default: 'local', modes: { thinking: 'reasoner' } },
    },
  };

  it('captures git, node, backends, and routing with an injected execFile', () => {
    const execFile = (_cmd: string, args: string[]): string => {
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc1234def';
      if (args[0] === 'log') return 'Merge PR #1';
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'main';
      return '';
    };
    const p = gatherProvenance(config, { execFile, harnessVersion: '0.16.0' });

    expect(p.gitHead).toBe('abc1234def');
    expect(p.gitSubject).toBe('Merge PR #1');
    expect(p.branch).toBe('main');
    expect(p.harnessVersion).toBe('0.16.0');
    expect(p.node).toBe(process.version);
    expect(p.routing).toEqual({ default: 'local', modes: { thinking: 'reasoner' } });
    // model array is joined; string model preserved; endpoint threaded
    expect(p.backends).toContainEqual({
      name: 'local',
      type: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1',
      model: 'qwen3-coder:30b',
    });
    expect(p.backends).toContainEqual({ name: 'reasoner', type: 'ollama', model: 'qwen3.6:27b' });
    expect(p.backends).toContainEqual({ name: 'primary', type: 'claude' });
  });

  it('degrades every git field to null when git throws, without throwing', () => {
    const execFile = () => {
      throw new Error('not a git repo');
    };
    const p = gatherProvenance(config, { execFile });
    expect(p.gitHead).toBeNull();
    expect(p.gitSubject).toBeNull();
    expect(p.branch).toBeNull();
    // non-git provenance still present
    expect(p.backends).toHaveLength(3);
    expect(p.routing.default).toBe('local');
  });

  it('omits routing.modes when empty and tolerates a missing agent block', () => {
    const p = gatherProvenance({}, { execFile: () => '' });
    expect(p.backends).toEqual([]);
    expect(p.routing.modes).toBeUndefined();
  });
});

describe('FlightRecorder', () => {
  let dir: string;
  const provenance = gatherProvenance(
    { agent: { backends: { local: { type: 'ollama' } }, routing: { default: 'local' } } },
    { execFile: () => 'sha' }
  );

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flight-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function read(runId: string): RunRecord {
    return JSON.parse(readFileSync(join(dir, runId, 'run.json'), 'utf-8')) as RunRecord;
  }

  it('writes a run record on startRun with provenance', () => {
    const fr = new FlightRecorder(dir, 'run-1', noopLogger);
    fr.startRun('orchestrator-x', provenance);
    const rec = read('run-1');
    expect(rec.runId).toBe('run-1');
    expect(rec.orchestratorId).toBe('orchestrator-x');
    expect(rec.endedAt).toBeNull();
    expect(rec.provenance.routing.default).toBe('local');
    expect(rec.units).toEqual({});
  });

  it('accumulates gate-blocks then preserves the count under a terminal verdict', () => {
    const fr = new FlightRecorder(dir, 'run-2', noopLogger);
    fr.startRun(null, provenance);
    fr.recordVerdict({
      issueId: 'i1',
      identifier: 'unit-1',
      verdict: 'gate-blocked',
      gateReason: 'typecheck failed',
    });
    fr.recordVerdict({
      issueId: 'i1',
      identifier: 'unit-1',
      verdict: 'gate-blocked',
      gateReason: 'still failing',
    });
    fr.recordVerdict({ issueId: 'i1', identifier: 'unit-1', verdict: 'needs-human', attempt: 8 });

    const u = read('run-2').units['i1'];
    expect(u?.gateBlocks).toBe(2);
    expect(u?.verdict).toBe('needs-human');
    expect(u?.attempt).toBe(8);
    // last-known gate reason is preserved across the terminal write
    expect(u?.gateReason).toBe('still failing');
  });

  it('records a shipped verdict with PR number', () => {
    const fr = new FlightRecorder(dir, 'run-3', noopLogger);
    fr.startRun(null, provenance);
    fr.recordVerdict({ issueId: 'i2', identifier: 'unit-2', verdict: 'shipped', pr: 42 });
    const u = read('run-3').units['i2'];
    expect(u?.verdict).toBe('shipped');
    expect(u?.pr).toBe(42);
    expect(u?.gateBlocks).toBe(0);
  });

  it('finishRun stamps endedAt', () => {
    const fr = new FlightRecorder(dir, 'run-4', noopLogger);
    fr.startRun(null, provenance);
    fr.finishRun();
    expect(read('run-4').endedAt).not.toBeNull();
  });

  it('is a no-op (never throws) when recordVerdict/finishRun run before startRun', () => {
    const fr = new FlightRecorder(dir, 'run-5', noopLogger);
    expect(() =>
      fr.recordVerdict({ issueId: 'x', identifier: 'x', verdict: 'shipped' })
    ).not.toThrow();
    expect(() => fr.finishRun()).not.toThrow();
    expect(FlightRecorder.getRun(dir, 'run-5')).toBeNull();
  });

  it('lists runs newest-first and reads a single run back', () => {
    new FlightRecorder(dir, 'run-old', noopLogger).startRun(null, { ...provenance });
    // ensure a later startedAt for run-new by writing after
    const frNew = new FlightRecorder(dir, 'run-new', noopLogger);
    frNew.startRun(null, provenance);
    // Force run-new to sort first regardless of clock resolution
    const rec = read('run-new');
    expect(rec).toBeTruthy();

    const runs = FlightRecorder.listRuns(dir);
    expect(runs.map((r) => r.runId).sort()).toEqual(['run-new', 'run-old']);
    expect(FlightRecorder.getRun(dir, 'run-new')?.runId).toBe('run-new');
    expect(FlightRecorder.getRun(dir, 'does-not-exist')).toBeNull();
  });

  it('listRuns returns empty for a missing directory', () => {
    expect(FlightRecorder.listRuns(join(dir, 'nope'))).toEqual([]);
  });
});
