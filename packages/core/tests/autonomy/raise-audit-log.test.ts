import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  writeSessionOverride,
  writeLoweringOverride,
  computeRepoKey,
  autonomyAuditLogPath,
} from '../../src/autonomy/index';

/**
 * I1(c) / D16: every SUCCESSFUL raise appends exactly one JSON line
 * {ts, session, repoKey, from, to, origin} to ~/.harness/autonomy-audit.log. Lowerings and
 * refused raises append nothing. If the line cannot be written, the raise is not applied.
 */
let tmp: string;
let home: string;
let project: string;
const T0 = new Date('2026-06-01T00:00:00.000Z');
const noGit = { gitCommonDir: () => undefined };
const opts = (extra: object = {}) => ({ homeDir: home, now: () => T0, ...noGit, ...extra });
const logLines = (p = autonomyAuditLogPath({ homeDir: home })) =>
  fs.existsSync(p)
    ? fs
        .readFileSync(p, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-audit-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('raise audit log (I1c, D16)', () => {
  it('defaults to <home>/.harness/autonomy-audit.log', () => {
    expect(autonomyAuditLogPath({ homeDir: '/h' }).replaceAll('\\', '/')).toBe(
      '/h/.harness/autonomy-audit.log'
    );
  });

  it('a raise appends one line with ts, session, repoKey, from, to, origin', () => {
    expect(writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', opts()).ok).toBe(true);
    expect(logLines()).toEqual([
      {
        ts: T0.toISOString(),
        session: 's1',
        repoKey: computeRepoKey(project, noGit),
        from: { level: null, audit: null },
        to: { level: 'trusted' },
        origin: 'cli',
      },
    ]);
  });

  it('records the prior override values in `from`, and appends (never rewrites)', () => {
    expect(
      writeSessionOverride(project, 's1', { level: 'supervised', audit: true }, 'mcp', opts()).ok
    ).toBe(true);
    expect(logLines()).toEqual([]); // a lowering is not logged
    expect(writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', opts()).ok).toBe(true);
    expect(writeSessionOverride(project, 's1', { audit: false }, 'cli', opts()).ok).toBe(true);
    const lines = logLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      from: { level: 'supervised', audit: true },
      to: { level: 'trusted' },
    });
    expect(lines[1]).toMatchObject({
      from: { level: 'trusted', audit: true },
      to: { audit: false },
    });
  });

  it('a lowering through the agent path appends nothing', () => {
    expect(writeLoweringOverride(project, 's1', { level: 'supervised' }, opts()).ok).toBe(true);
    expect(logLines()).toEqual([]);
  });

  it('a refused raise (no session dir) appends nothing', () => {
    expect(writeSessionOverride(project, 'nope', { level: 'trusted' }, 'cli', opts()).ok).toBe(
      false
    );
    expect(logLines()).toEqual([]);
  });

  it('honours an injected log path', () => {
    const p = path.join(tmp, 'elsewhere', 'audit.log');
    expect(
      writeSessionOverride(project, 's1', { audit: false }, 'cli', opts({ auditLogPath: p })).ok
    ).toBe(true);
    expect(logLines(p)).toHaveLength(1);
    expect(logLines()).toEqual([]);
  });

  it('if the line cannot be written, the raise is NOT applied', () => {
    const p = path.join(tmp, 'is-a-dir');
    fs.mkdirSync(p);
    const w = writeSessionOverride(
      project,
      's1',
      { level: 'trusted' },
      'cli',
      opts({ auditLogPath: p })
    );
    expect(w.ok).toBe(false);
    // The override file was not written: a later lowering of audit sees no level field.
    const read = writeLoweringOverride(project, 's1', { audit: true }, opts());
    expect(read.ok && read.value.level).toBeUndefined();
  });
});
