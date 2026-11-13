import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import {
  runAutonomyLog,
  formatAutonomyLog,
  createAutonomyLogCommand,
} from '../../src/commands/autonomy/log';

let tmp: string;
let project: string;
const deps = () => ({ cwd: () => project });
const base = {
  ts: '2026-11-13T00:00:00.000Z',
  skill: 'harness-planning',
  phase: 'DECOMPOSE',
  question: 'Which approach?',
  options: ['A', 'B'],
  chosen: 'A',
  rationale: 'r',
  autonomySource: 'user-config',
};
const ceremony = { ...base, pauseClass: 'ceremony', options: ['approve'], chosen: 'approve' };
const j = (audit: unknown) => ({ ...base, pauseClass: 'judgment', audit });
const logFile = () => path.join(project, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');
const writeLog = (lines: string[]) => fs.writeFileSync(logFile(), lines.join('\n') + '\n');

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-autonomy-log-'));
  project = path.join(tmp, 'project');
  fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('harness autonomy log', () => {
  it('renders counts, audited N/M with M counting unavailable/off (SC9), and each judgment', () => {
    writeLog(
      [
        ceremony,
        ceremony,
        j({ status: 'agreed', blindPick: 'A' }),
        j({ status: 'agreed', blindPick: 'A' }),
        j({ status: 'escalated', blindPick: 'B', humanChoice: 'A' }),
        j({ status: 'unavailable' }),
        j({ status: 'off' }),
      ].map((e) => JSON.stringify(e))
    );
    const out = runAutonomyLog({ session: 's1' }, deps());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const lines = formatAutonomyLog(out.report);
    expect(lines.slice(0, 5)).toEqual([
      'Auto-decisions (session s1): 7',
      '  by class: ceremony 2, judgment 5',
      '  audited 3/5 (unavailable 1, off 1)',
      '  agreement rate: 66% (2/3)',
      '  escalations: 1',
    ]);
    expect(lines[5]).toBe('  Audit statuses are agent-reported.');
    expect(lines.filter((l) => l.startsWith('  - ['))).toHaveLength(5);
  });
  it('distinguishes an absent log from an empty one (a zero is not evidence)', () => {
    const absent = runAutonomyLog({ session: 's1' }, deps());
    expect(absent.ok && formatAutonomyLog(absent.report)[0]).toMatch(/no log file at/);
    fs.writeFileSync(logFile(), '');
    const empty = runAutonomyLog({ session: 's1' }, deps());
    expect(empty.ok && formatAutonomyLog(empty.report)[0]).toMatch(/log is empty/);
  });
  it('warns about unreadable lines and reports them in the report', () => {
    writeLog([JSON.stringify(ceremony), '{tampered']);
    const out = runAutonomyLog({ session: 's1' }, deps());
    expect(out.ok && out.report.invalidLines.map((i) => i.line)).toEqual([2]);
    expect(
      out.ok && formatAutonomyLog(out.report).some((l) => l.includes('WARNING: 1 unreadable'))
    ).toBe(true);
  });
  it('fails for a missing session or an invalid slug', () => {
    const gone = runAutonomyLog({ session: 'gone' }, deps());
    expect(gone.ok).toBe(false);
    const msg = !gone.ok ? gone.message : '';
    expect(msg).toContain('Check the session slug.');
    expect(msg).not.toMatch(/record|pause/i);
    expect(runAutonomyLog({ session: '../x' }, deps()).ok).toBe(false);
  });
  it('falls back to the newest archived copy of the session (review I2)', () => {
    const dir = path.join(project, '.harness', 'archive', 'sessions', 'done-2026-11-12');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'auto-decisions.jsonl'), JSON.stringify(ceremony) + '\n');
    const out = runAutonomyLog({ session: 'done' }, deps());
    expect(out.ok && out.report.archived).toBe(true);
    const lines = out.ok ? formatAutonomyLog(out.report) : [];
    expect(lines[0]).toMatch(/^Read from archived session: .*done-2026-11-12/);
    expect(lines[1]).toBe('Auto-decisions (session done): 1');
  });
  it('emits the report as JSON under the global --json flag', async () => {
    writeLog([JSON.stringify(ceremony)]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command().option('--json').exitOverride();
    program.addCommand(createAutonomyLogCommand(deps()));
    await program.parseAsync(['node', 'harness', '--json', 'log', '--session', 's1']);
    const parsed = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(parsed).toMatchObject({
      session: 's1',
      logPresent: true,
      summary: { total: 1, judgments: 0 },
      invalidLines: [],
    });
  });
  it('--json never emits raw C1/bidi characters from an unreadable line (review S6)', async () => {
    writeLog([JSON.stringify(ceremony), 'x\u202e\u009bevil']);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = new Command().option('--json').exitOverride();
    program.addCommand(createAutonomyLogCommand(deps()));
    await program.parseAsync(['node', 'harness', '--json', 'log', '--session', 's1']);
    const raw = String(log.mock.calls[0]?.[0]);
    expect(raw).not.toMatch(/[\u0080-\u009f\u202a-\u202e]/);
    expect(JSON.parse(raw).invalidLines[0].error).toContain('\\u202e');
  });
  it('sets exit code 1 when the session does not exist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const program = new Command().option('--json').exitOverride();
    program.addCommand(createAutonomyLogCommand(deps()));
    await program.parseAsync(['node', 'harness', 'log', '--session', 'gone']);
    expect(process.exitCode).toBe(1);
  });
});
