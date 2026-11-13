import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AutonomySessionOverride } from '@harness-engineering/types';
import {
  writeSessionOverride,
  readSessionOverride,
  resolveAutonomy,
  resolveAutonomyForSession,
  AUTONOMY_SESSION_NOT_FOUND,
  DEFAULT_RAISE_TTL_MS,
} from '../../src/autonomy/index';

/**
 * I2 / D14: a RAISE (level trusted, or audit off) is bound to an existing
 * `.harness/sessions/<slug>/` under the project root and expires (default 24h). An expired
 * or expiry-less raised field is ignored at resolution (falls through, warning). Lowerings
 * need no session dir and never expire.
 */
let tmp: string;
let home: string;
let project: string;
const T0 = new Date('2026-06-01T00:00:00.000Z');
const plus = (ms: number) => new Date(T0.getTime() + ms);
const H = 3_600_000;
const noGit = { gitCommonDir: () => undefined };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-raise-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const mkSession = (slug = 's1') =>
  fs.mkdirSync(path.join(project, '.harness', 'sessions', slug), { recursive: true });
const opts = (extra: object = {}) => ({ homeDir: home, now: () => T0, ...noGit, ...extra });
const readBack = () => {
  const r = readSessionOverride(project, 's1', opts());
  if (!r.ok) throw r.error;
  return r.value.override;
};

describe('raising writes are bound to an existing session dir (D14)', () => {
  it.each([[{ level: 'trusted' as const }], [{ audit: false }]])(
    'refuses raise %j when .harness/sessions/<slug>/ does not exist; writes nothing',
    (change) => {
      const w = writeSessionOverride(project, 's1', change, 'cli', opts());
      expect(w.ok).toBe(false);
      expect(!w.ok && (w.error as { code?: string }).code).toBe(AUTONOMY_SESSION_NOT_FOUND);
      expect(readBack()).toBeNull();
    }
  );

  it('a session dir for a DIFFERENT slug does not satisfy the bind', () => {
    mkSession('other');
    expect(writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', opts()).ok).toBe(false);
  });

  it('a plain file at the session path does not satisfy the bind', () => {
    fs.mkdirSync(path.join(project, '.harness', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(project, '.harness', 'sessions', 's1'), '');
    expect(writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', opts()).ok).toBe(false);
  });

  it('a lowering needs no session dir and gets no expiry', () => {
    const w = writeSessionOverride(
      project,
      's1',
      { level: 'supervised', audit: true },
      'mcp',
      opts()
    );
    expect(w.ok).toBe(true);
    expect(readBack()?.level?.expiresAt).toBeUndefined();
    expect(readBack()?.audit?.expiresAt).toBeUndefined();
  });

  it('the session dir is looked up under the path AS GIVEN (resolveSessionDir), not the git root', () => {
    mkSession();
    const sub = path.join(project, 'deep', 'er');
    fs.mkdirSync(sub, { recursive: true });
    const git = { ...opts(), gitCommonDir: () => path.join(project, '.git') };
    // Positive control: the project, which has .harness/sessions/s1, accepts the raise.
    expect(writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', git).ok).toBe(true);
    // A subdirectory of the same repo has no session dir of its own, so the raise is refused.
    const fromSub = writeSessionOverride(sub, 's1', { level: 'trusted' }, 'cli', git);
    expect(!fromSub.ok && (fromSub.error as { code?: string }).code).toBe(
      'AUTONOMY_SESSION_NOT_FOUND'
    );
    // ...until that subdirectory (a monorepo subproject) has its own session dir.
    fs.mkdirSync(path.join(sub, '.harness', 'sessions', 's1'), { recursive: true });
    expect(writeSessionOverride(sub, 's1', { level: 'trusted' }, 'cli', git).ok).toBe(true);
  });
});

describe('raised fields carry an expiry (D14)', () => {
  beforeEach(() => mkSession());

  it('defaults to 24h', () => {
    expect(DEFAULT_RAISE_TTL_MS).toBe(24 * H);
    const w = writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', opts());
    expect(w.ok && w.value.level?.expiresAt).toBe(plus(24 * H).toISOString());
  });

  it('honours raiseTtlMs', () => {
    const w = writeSessionOverride(
      project,
      's1',
      { audit: false },
      'cli',
      opts({ raiseTtlMs: 2 * H })
    );
    expect(w.ok && w.value.audit?.expiresAt).toBe(plus(2 * H).toISOString());
  });

  it('only the raised field expires: {trusted, audit on} → level expires, audit does not', () => {
    const w = writeSessionOverride(project, 's1', { level: 'trusted', audit: true }, 'cli', opts());
    expect(w.ok && w.value.level?.expiresAt).toBeDefined();
    expect(w.ok && w.value.audit?.expiresAt).toBeUndefined();
  });

  it('a later lowering of the field drops its expiry', () => {
    expect(writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', opts()).ok).toBe(true);
    expect(writeSessionOverride(project, 's1', { level: 'supervised' }, 'mcp', opts()).ok).toBe(
      true
    );
    expect(readBack()?.level).toEqual({
      value: 'supervised',
      setAt: T0.toISOString(),
      origin: 'mcp',
    });
  });
});

describe('resolution ignores expired raises; lowerings never expire (D14)', () => {
  const at = (iso: string) => () => new Date(iso);
  const field = <T>(value: T, expiresAt?: string) => ({
    value,
    setAt: T0.toISOString(),
    origin: 'cli' as const,
    ...(expiresAt !== undefined && { expiresAt }),
  });
  const run = (o: AutonomySessionOverride, now: Date) =>
    resolveAutonomy({ env: {}, readFile: () => undefined, sessionOverride: o, now: () => now });

  it('a live raise applies', () => {
    const r = run({ level: field('trusted' as const, plus(H).toISOString()) }, T0);
    expect([r.level, r.source.level]).toEqual(['trusted', 'session']);
    expect(r.warnings).toEqual([]);
  });

  it('an expired raised level falls through to the next tier with a warning', () => {
    const r = run({ level: field('trusted' as const, plus(H).toISOString()) }, plus(2 * H));
    expect([r.level, r.source.level]).toEqual(['supervised', 'default']);
    expect(r.warnings.join('\n')).toMatch(/expired/i);
  });

  it('the expiry instant itself is expired', () => {
    const r = run({ level: field('trusted' as const, plus(H).toISOString()) }, plus(H));
    expect(r.source.level).toBe('default');
  });

  it('an expired audit-off falls through (trusted user config keeps audit on)', () => {
    const r = resolveAutonomy({
      env: {},
      readFile: () => JSON.stringify({ autonomy: { level: 'trusted' } }),
      sessionOverride: { audit: field(false, plus(H).toISOString()) },
      now: () => plus(25 * H),
    });
    expect([r.audit, r.source.audit]).toEqual([true, 'default']);
    expect(r.warnings.join('\n')).toMatch(/expired/i);
  });

  it('a raised field with NO expiry is ignored (a hand-written or legacy grant cannot be permanent)', () => {
    const r = run({ level: field('trusted' as const) }, T0);
    expect(r.source.level).toBe('default');
    expect(r.warnings.join('\n')).toMatch(/expir/i);
  });

  it('a lowering never expires, even with a past expiresAt', () => {
    const r = resolveAutonomy({
      env: {},
      readFile: () => JSON.stringify({ autonomy: { level: 'trusted' } }),
      sessionOverride: { level: field('supervised' as const, '2000-01-01T00:00:00.000Z') },
      now: at('2030-01-01T00:00:00.000Z'),
    });
    expect([r.level, r.source.level]).toEqual(['supervised', 'session']);
  });

  it('end to end with an injected clock: --for 2h is live at +1h and gone at +3h', () => {
    mkSession();
    const w = writeSessionOverride(
      project,
      's1',
      { level: 'trusted' },
      'cli',
      opts({ raiseTtlMs: 2 * H })
    );
    expect(w.ok).toBe(true);
    const resolveAt = (d: Date) =>
      resolveAutonomyForSession({
        projectPath: project,
        session: 's1',
        env: {},
        ...opts(),
        now: () => d,
      });
    expect(resolveAt(plus(H)).level).toBe('trusted');
    const later = resolveAt(plus(3 * H));
    expect([later.level, later.source.level]).toEqual(['supervised', 'default']);
  });
});
