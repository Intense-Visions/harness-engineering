import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AutoDecision } from '@harness-engineering/types';
import {
  appendAutoDecision,
  autoDecisionLogPath,
  readAutoDecisions,
  MAX_AUTO_DECISION_LINE_BYTES,
} from '../../src/autonomy/decision-log';
import { resolveSessionDir } from '../../src/state/session-resolver';

let tmp: string;
let project: string;
const git = { gitToplevel: () => undefined, gitCommonDir: () => undefined };
const entry = (over: Partial<AutoDecision> = {}): AutoDecision => ({
  ts: '2026-11-13T00:00:00.000Z',
  skill: 'harness-planning',
  phase: 'VALIDATE',
  pauseClass: 'ceremony',
  question: 'Approve plan?',
  options: ['approve'],
  chosen: 'approve',
  rationale: 'all truths traced',
  autonomySource: 'user-config',
  ...over,
});
const sessionDir = (slug = 's1') => path.join(project, '.harness', 'sessions', slug);
const logFile = () => path.join(sessionDir(), 'auto-decisions.jsonl');
const codeOf = (r: { ok: boolean; error?: unknown }) =>
  r.ok ? null : (r.error as { code?: string }).code;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-dlog-'));
  project = path.join(tmp, 'project');
  fs.mkdirSync(sessionDir(), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('autoDecisionLogPath', () => {
  it('matches the resolveSessionDir layout (parity without importing state into autonomy)', () => {
    const p = autoDecisionLogPath(project, 's1', git);
    const dir = resolveSessionDir(project, 's1');
    expect(p.ok && dir.ok).toBe(true);
    if (p.ok && dir.ok) {
      expect(p.value.replaceAll('\\', '/')).toBe(
        path.join(dir.value, 'auto-decisions.jsonl').replaceAll('\\', '/')
      );
    }
  });
  it.each(['../x', 'CON', ' s1', 'a/b', ''])('rejects slug %j via the shared rule', (slug) => {
    expect(autoDecisionLogPath(project, slug, git).ok).toBe(false);
    expect(appendAutoDecision(project, slug, entry(), git).ok).toBe(false);
  });
});

describe('appendAutoDecision', () => {
  it('appends one line per call and never truncates existing content', () => {
    fs.writeFileSync(logFile(), 'pre-existing\n');
    expect(appendAutoDecision(project, 's1', entry({ question: 'one' }), git).ok).toBe(true);
    expect(appendAutoDecision(project, 's1', entry({ question: 'two' }), git).ok).toBe(true);
    const lines = fs.readFileSync(logFile(), 'utf-8').split('\n');
    expect(lines[0]).toBe('pre-existing');
    expect(JSON.parse(lines[1] ?? '').question).toBe('one');
    expect(JSON.parse(lines[2] ?? '').question).toBe('two');
    expect(lines[3]).toBe('');
  });
  it('refuses a missing session dir and does not create it', () => {
    const r = appendAutoDecision(project, 'nope', entry(), git);
    expect(codeOf(r)).toBe('AUTO_DECISION_SESSION_NOT_FOUND');
    expect(!r.ok && r.error.message).toMatch(/NOT recorded.*pause and ask the human/);
    expect(fs.existsSync(sessionDir('nope'))).toBe(false);
  });
  it('returns AUTO_DECISION_WRITE_FAILED when the log path cannot be appended (EISDIR)', () => {
    fs.mkdirSync(logFile());
    const r = appendAutoDecision(project, 's1', entry(), git);
    expect(codeOf(r)).toBe('AUTO_DECISION_WRITE_FAILED');
    expect(!r.ok && r.error.message).toContain('auto-decisions.jsonl');
  });
  it('returns AUTO_DECISION_WRITE_FAILED on a throwing or partial write', () => {
    const thrown = appendAutoDecision(project, 's1', entry(), {
      ...git,
      appendBytes: () => {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      },
    });
    expect(codeOf(thrown)).toBe('AUTO_DECISION_WRITE_FAILED');
    const partial = appendAutoDecision(project, 's1', entry(), {
      ...git,
      appendBytes: (_f, data) => data.length - 1,
    });
    expect(codeOf(partial)).toBe('AUTO_DECISION_WRITE_FAILED');
    expect(!partial.ok && partial.error.message).toContain('partial write');
  });
  it('a truncated last line cannot swallow the next entry (review S2)', () => {
    fs.writeFileSync(logFile(), `${JSON.stringify(entry({ question: 'ok' }))}\n{"ts":"trunc`);
    expect(appendAutoDecision(project, 's1', entry({ question: 'after' }), git).ok).toBe(true);
    const r = readAutoDecisions(project, 's1', git);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.entries.map((e) => e.question)).toEqual(['ok', 'after']);
    expect(r.value.invalid.map((i) => i.line)).toEqual([2]); // only the fragment
  });
  it('adds no separator to an empty log or one that ends in a newline', () => {
    fs.writeFileSync(logFile(), '');
    expect(appendAutoDecision(project, 's1', entry(), git).ok).toBe(true);
    expect(appendAutoDecision(project, 's1', entry(), git).ok).toBe(true);
    const raw = fs.readFileSync(logFile(), 'utf-8');
    expect(raw.startsWith('{')).toBe(true);
    expect(raw.split('\n')).toHaveLength(3); // two lines + trailing ''
  });
  it('rejects an entry over the line cap as AUTO_DECISION_INVALID without writing', () => {
    const big = entry({ rationale: 'é'.repeat(MAX_AUTO_DECISION_LINE_BYTES) });
    const r = appendAutoDecision(project, 's1', big, git);
    expect(codeOf(r)).toBe('AUTO_DECISION_INVALID');
    expect(fs.existsSync(logFile())).toBe(false);
  });
});

describe('readAutoDecisions', () => {
  it('reports an absent log as present:false with no entries', () => {
    const r = readAutoDecisions(project, 's1', git);
    expect(r.ok && { present: r.value.present, n: r.value.entries.length }).toEqual({
      present: false,
      n: 0,
    });
  });
  it('returns valid entries and reports unreadable lines with their 1-based numbers', () => {
    fs.writeFileSync(
      logFile(),
      [JSON.stringify(entry()), 'garbage', '', JSON.stringify(entry({ question: 'b' }))].join(
        '\n'
      ) + '\n'
    );
    const r = readAutoDecisions(project, 's1', git);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.present).toBe(true);
    expect(r.value.entries.map((e) => e.question)).toEqual(['Approve plan?', 'b']);
    expect(r.value.invalid.map((i) => i.line)).toEqual([2, 3]);
  });
  it('refuses a missing session dir with read-path wording (review S1)', () => {
    const r = readAutoDecisions(project, 'nope', git);
    expect(codeOf(r)).toBe('AUTO_DECISION_SESSION_NOT_FOUND');
    const msg = !r.ok ? r.error.message : '';
    expect(msg).toContain('Session "nope" not found');
    expect(msg).toContain('There is no decision log to read.');
    expect(msg).not.toMatch(/record|pause/i);
    const hinted = readAutoDecisions(project, 'nope', { ...git, sessionNotFoundHint: 'Hint.' });
    expect(!hinted.ok && hinted.error.message.endsWith(' Hint.')).toBe(true);
  });
});

describe('append-only by construction', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/autonomy/decision-log.ts'), 'utf-8');
  it('positive control: the real module was read', () => {
    expect(src).toContain('export function appendAutoDecision');
  });
  it('never rewrites, truncates, renames or deletes, and opens only in append mode', () => {
    expect(src).not.toMatch(
      /writeFileSync|rmSync|unlinkSync|truncate|renameSync|copyFileSync|rmdirSync/
    );
    // 'a+': O_APPEND writes (always at end of file) plus reads for the S2 tail check.
    expect(src.match(/openSync\([^)]*\)/g)).toEqual(["openSync(file, 'a+', 0o600)"]);
  });
});
