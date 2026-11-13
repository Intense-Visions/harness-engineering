import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { recordAutoDecision } from '../../src/autonomy/decision-log';
import { writeSessionOverride } from '../../src/autonomy/override-store';
import { writeLoweringOverride } from '../../src/autonomy/lower-only';

let tmp: string;
let home: string;
let project: string;
const NOW = '2026-11-13T12:00:00.000Z';
const ceremony = {
  skill: 'harness-planning',
  phase: 'VALIDATE',
  pauseClass: 'ceremony',
  question: 'Approve plan?',
  options: ['approve'],
  chosen: 'approve',
  rationale: 'all truths traced',
};
const judgment = (audit: Record<string, unknown>) => ({
  skill: 'harness-brainstorming',
  phase: 'EVALUATE',
  pauseClass: 'judgment',
  question: 'Which approach?',
  options: ['A', 'B'],
  chosen: 'A',
  rationale: 'r',
  audit,
});
const opts = () => ({
  homeDir: home,
  env: {},
  now: () => new Date(NOW),
  gitCommonDir: () => undefined,
});
const logFile = () => path.join(project, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');
const lines = () =>
  fs.existsSync(logFile()) ? fs.readFileSync(logFile(), 'utf-8').trim().split('\n') : [];
const userConfig = (autonomy: unknown) => {
  fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
  fs.writeFileSync(path.join(home, '.harness', 'config.json'), JSON.stringify({ autonomy }));
};
const err = (r: ReturnType<typeof recordAutoDecision>) =>
  r.ok
    ? null
    : {
        code: (r.error as { code?: string }).code,
        fields: (r.error as { fields?: string[] }).fields,
      };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-record-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('recordAutoDecision', () => {
  it('stamps ts from the clock and autonomySource from the resolver (user config)', () => {
    userConfig({ level: 'trusted' });
    const r = recordAutoDecision(project, 's1', ceremony, opts());
    expect(r.ok && { ts: r.value.ts, src: r.value.autonomySource }).toEqual({
      ts: NOW,
      src: 'user-config',
    });
    expect(lines()).toHaveLength(1);
    expect(JSON.parse(lines()[0] ?? '')).toEqual(r.ok ? r.value : null);
  });
  it('stamps "session" when a session override supplies trusted', () => {
    expect(writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { ...opts() }).ok).toBe(
      true
    );
    const r = recordAutoDecision(
      project,
      's1',
      judgment({ status: 'agreed', blindPick: 'A' }),
      opts()
    );
    expect(r.ok && r.value.autonomySource).toBe('session');
  });
  it('rejects a caller-supplied autonomySource or ts and writes nothing (anti-spoof)', () => {
    userConfig({ level: 'trusted' });
    expect(
      err(recordAutoDecision(project, 's1', { ...ceremony, autonomySource: 'flag' }, opts()))
    ).toEqual({ code: 'AUTO_DECISION_INVALID', fields: ['autonomySource'] });
    expect(err(recordAutoDecision(project, 's1', { ...ceremony, ts: NOW }, opts()))?.code).toBe(
      'AUTO_DECISION_INVALID'
    );
    expect(lines()).toEqual([]);
    expect(recordAutoDecision(project, 's1', ceremony, opts()).ok).toBe(true); // positive control
  });
  it.each(['../x', 'CON', ' s1', 7])('rejects session %j via the shared slug rule', (session) => {
    userConfig({ level: 'trusted' });
    expect(err(recordAutoDecision(project, session, ceremony, opts()))).toEqual({
      code: 'AUTO_DECISION_INVALID',
      fields: ['session'],
    });
  });
  it('refuses a session whose dir does not exist', () => {
    userConfig({ level: 'trusted' });
    expect(err(recordAutoDecision(project, 'gone', ceremony, opts()))?.code).toBe(
      'AUTO_DECISION_SESSION_NOT_FOUND'
    );
  });
  it('returns AUTO_DECISION_WRITE_FAILED when the append fails, and nothing claims success', () => {
    userConfig({ level: 'trusted' });
    fs.mkdirSync(logFile());
    expect(err(recordAutoDecision(project, 's1', ceremony, opts()))?.code).toBe(
      'AUTO_DECISION_WRITE_FAILED'
    );
  });
  it('(gate) refuses a non-escalated entry while autonomy is supervised', () => {
    const r = recordAutoDecision(project, 's1', ceremony, opts());
    expect(err(r)?.code).toBe('AUTO_DECISION_NOT_AUTHORIZED');
    expect(lines()).toEqual([]);
  });
  /**
   * Review I1: an escalated entry is agent-reported like any other ("the human chose A" is the
   * agent's claim). Exempting it let a supervised agent record a fabricated human choice that
   * `harness autonomy log` then presented as an escalation, so it faces the same trusted gate.
   */
  it('(gate) refuses an escalated entry while supervised: the human choice is agent-reported', () => {
    const escalated = judgment({ status: 'escalated', blindPick: 'B', humanChoice: 'A' });
    const r = recordAutoDecision(project, 's1', escalated, opts());
    expect(err(r)?.code).toBe('AUTO_DECISION_NOT_AUTHORIZED');
    expect(lines()).toEqual([]);
  });
  it('(gate) accepts an escalated entry while trusted', () => {
    userConfig({ level: 'trusted' });
    const escalated = judgment({ status: 'escalated', blindPick: 'B', humanChoice: 'A' });
    const r = recordAutoDecision(project, 's1', escalated, opts());
    expect(r.ok && r.value.autonomySource).toBe('user-config');
    expect(lines()).toHaveLength(1);
  });
  it('(gate) refuses audit "off" while audit resolves on, accepts it when audit is off', () => {
    userConfig({ level: 'trusted' });
    expect(err(recordAutoDecision(project, 's1', judgment({ status: 'off' }), opts()))?.code).toBe(
      'AUTO_DECISION_NOT_AUTHORIZED'
    );
    userConfig({ level: 'trusted', audit: { trusted: false } });
    expect(recordAutoDecision(project, 's1', judgment({ status: 'off' }), opts()).ok).toBe(true);
  });
  it('(gate) a mid-session lowering refuses the next entry; earlier lines are unchanged (SC7)', () => {
    userConfig({ level: 'trusted' });
    expect(recordAutoDecision(project, 's1', ceremony, opts()).ok).toBe(true);
    const before = fs.readFileSync(logFile(), 'utf-8');
    expect(writeLoweringOverride(project, 's1', { level: 'supervised' }, { ...opts() }).ok).toBe(
      true
    );
    expect(err(recordAutoDecision(project, 's1', ceremony, opts()))?.code).toBe(
      'AUTO_DECISION_NOT_AUTHORIZED'
    );
    expect(fs.readFileSync(logFile(), 'utf-8')).toBe(before);
  });
});
