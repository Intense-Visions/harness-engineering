import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSessionOverride, writeSessionOverride } from '../../src/autonomy/override-store';
import { sessionOverridePath } from '../../src/autonomy/paths';

let tmp: string;
let home: string;
let project: string;
const at = (iso: string) => () => new Date(iso);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-store-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('session override store', () => {
  it('reads null when no override exists', () => {
    const r = readSessionOverride(project, 's1', { homeDir: home });
    expect(r.ok && r.value.override).toBeNull();
  });

  it('writes under the home dir, never under the project (D12)', () => {
    // A raise is bound to a live session dir (D14); that dir is the ONLY project path touched.
    fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
    const w = writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', {
      homeDir: home,
      now: at('2026-01-01T00:00:00.000Z'),
    });
    expect(w.ok).toBe(true);
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    expect(p.ok && fs.existsSync(p.value)).toBe(true);
    expect(p.ok && p.value.replaceAll('\\', '/')).toContain('/home/.harness/session-overrides/');
    expect(fs.readdirSync(path.join(project, '.harness'), { recursive: true }).sort()).toEqual([
      'sessions',
      path.join('sessions', 's1'),
    ]);
    const back = readSessionOverride(project, 's1', { homeDir: home });
    expect(back.ok && back.value.override).toEqual({
      level: {
        value: 'trusted',
        setAt: '2026-01-01T00:00:00.000Z',
        origin: 'cli',
        expiresAt: '2026-01-02T00:00:00.000Z',
      },
    });
  });

  it('updating one field preserves the other field and its timestamp', () => {
    fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
    const seed = writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', {
      homeDir: home,
      now: at('2026-01-01T00:00:00.000Z'),
    });
    expect(seed.ok).toBe(true);
    const w = writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
      homeDir: home,
      now: at('2026-01-02T00:00:00.000Z'),
    });
    expect(w.ok && w.value).toEqual({
      level: {
        value: 'trusted',
        setAt: '2026-01-01T00:00:00.000Z',
        origin: 'cli',
        expiresAt: '2026-01-02T00:00:00.000Z',
      },
      audit: { value: true, setAt: '2026-01-02T00:00:00.000Z', origin: 'mcp' },
    });
  });

  it('reads a malformed file as fail-closed (I4), and a write keeps those values', () => {
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    if (!p.ok) throw p.error;
    fs.mkdirSync(path.dirname(p.value), { recursive: true });
    fs.writeFileSync(p.value, '{nope');
    const r = readSessionOverride(project, 's1', { homeDir: home });
    expect(r.ok && r.value.override?.level?.value).toBe('supervised');
    expect(r.ok && r.value.override?.audit?.value).toBe(true);
    expect(r.ok && r.value.warnings).toHaveLength(1);
    const w = writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
      homeDir: home,
      now: at('2026-02-01T00:00:00.000Z'),
    });
    expect(w.ok).toBe(true);
    // The level was never written by anyone, but it was corrupt: it persists as supervised.
    expect(w.ok && w.value.level).toEqual({
      value: 'supervised',
      setAt: '2026-02-01T00:00:00.000Z',
      origin: 'mcp',
    });
  });

  it('rejects an empty change and a traversal slug without writing', () => {
    expect(writeSessionOverride(project, 's1', {}, 'cli', { homeDir: home }).ok).toBe(false);
    expect(
      writeSessionOverride(project, '../x', { level: 'supervised' }, 'cli', { homeDir: home }).ok
    ).toBe(false);
    expect(fs.existsSync(home)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('writes the file with mode 0600', () => {
    writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home });
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    if (!p.ok) throw p.error;
    expect(fs.statSync(p.value).mode & 0o777).toBe(0o600);
  });
});

/**
 * I4 (fail closed): a present-but-corrupt field reads as its LOWEST-autonomy value
 * (level → supervised, audit → true), never as absent. Absence would fall through to a lower
 * tier (e.g. a trusted user config) — a raise by corruption. A wholly corrupt file reads as
 * both fail-closed values. A fail-closed field outranks any flag (far-future setAt).
 */
describe('fail-closed degradation on read', () => {
  const LEVEL = { value: 'supervised', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' };
  const AUDIT = { value: true, setAt: '2026-01-02T00:00:00.000Z', origin: 'mcp' };
  const RAISED_LEVEL = { value: 'trusted', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' };
  const writeRaw = (doc: unknown) => {
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    if (!p.ok) throw p.error;
    fs.mkdirSync(path.dirname(p.value), { recursive: true });
    fs.writeFileSync(p.value, typeof doc === 'string' ? doc : JSON.stringify(doc));
  };
  const read = () => {
    const r = readSessionOverride(project, 's1', { homeDir: home });
    if (!r.ok) throw r.error;
    return r.value;
  };
  const failClosedLevel = expect.objectContaining({ value: 'supervised' });
  const failClosedAudit = expect.objectContaining({ value: true });

  it.each([
    ['string "false"', { ...AUDIT, value: 'false' }],
    ['null', { ...AUDIT, value: null }],
    ['0', { ...AUDIT, value: 0 }],
    ['bad origin', { ...AUDIT, value: false, origin: 'agent' }],
    ['bad setAt', { ...AUDIT, value: false, setAt: 'yesterday' }],
    ['non-object', 'false'],
  ])('a corrupt audit (%s) reads as audit ON; the valid level survives', (_n, audit) => {
    writeRaw({ level: RAISED_LEVEL, audit });
    const r = read();
    expect(r.override).toEqual({ level: RAISED_LEVEL, audit: failClosedAudit });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/audit/);
  });

  it.each([
    ['TRUSTED', { ...RAISED_LEVEL, value: 'TRUSTED' }],
    ['bad setAt', { ...RAISED_LEVEL, setAt: 'nope' }],
    ['bare string', 'trusted'],
  ])('a corrupt level (%s) reads as supervised; the valid audit survives', (_n, level) => {
    writeRaw({ level, audit: AUDIT });
    const r = read();
    expect(r.override).toEqual({ level: failClosedLevel, audit: AUDIT });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/level/);
  });

  it('a fail-closed field outranks any flag: its setAt is later than any real timestamp', () => {
    writeRaw({ level: 'trusted', audit: AUDIT });
    const setAt = read().override?.level?.setAt ?? '';
    expect(Date.parse(setAt)).toBeGreaterThan(Date.parse('9999-12-31T23:59:59.999Z'));
  });

  it('both fields corrupt → both fail closed, one warning per field', () => {
    writeRaw({ level: 'trusted', audit: 'false' });
    const r = read();
    expect(r.override).toEqual({ level: failClosedLevel, audit: failClosedAudit });
    expect(r.warnings).toHaveLength(2);
  });

  it.each([['[]'], ['"x"'], ['null'], ['{nope'], ['42']])(
    'a non-object / unparseable document (%s) → {supervised, audit on} with one warning',
    (raw) => {
      writeRaw(raw);
      const r = read();
      expect(r.override).toEqual({ level: failClosedLevel, audit: failClosedAudit });
      expect(r.warnings).toHaveLength(1);
    }
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'an existing but unreadable file fails closed (not read as absent)',
    () => {
      writeRaw({ level: RAISED_LEVEL });
      const p = sessionOverridePath(project, 's1', { homeDir: home });
      if (!p.ok) throw p.error;
      fs.chmodSync(p.value, 0o000);
      try {
        const r = read();
        expect(r.override).toEqual({ level: failClosedLevel, audit: failClosedAudit });
        expect(r.warnings).toHaveLength(1);
      } finally {
        fs.chmodSync(p.value, 0o600);
      }
    }
  );

  it('absent fields stay absent (only PRESENT corrupt fields fail closed)', () => {
    writeRaw({ audit: AUDIT });
    expect(read()).toEqual({ override: { audit: AUDIT }, warnings: [] });
  });

  it('positive control: a fully valid document reads back with no warnings', () => {
    writeRaw({ level: RAISED_LEVEL, audit: AUDIT });
    expect(read()).toEqual({ override: { level: RAISED_LEVEL, audit: AUDIT }, warnings: [] });
  });

  it('the writer never drops a corrupt field: it persists the fail-closed value', () => {
    writeRaw({ level: { ...LEVEL, value: 'yolo' }, audit: AUDIT });
    const w = writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
      homeDir: home,
      now: at('2026-03-01T00:00:00.000Z'),
    });
    expect(w.ok).toBe(true);
    expect(read()).toEqual({
      override: {
        level: { value: 'supervised', setAt: '2026-03-01T00:00:00.000Z', origin: 'mcp' },
        audit: { value: true, setAt: '2026-03-01T00:00:00.000Z', origin: 'mcp' },
      },
      warnings: [],
    });
  });

  it('a later write to the corrupt field replaces the fail-closed value', () => {
    writeRaw({ level: LEVEL, audit: 'false' });
    const w = writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
      homeDir: home,
      now: at('2026-03-01T00:00:00.000Z'),
    });
    expect(w.ok).toBe(true);
    expect(read()).toEqual({
      override: {
        level: LEVEL,
        audit: { value: true, setAt: '2026-03-01T00:00:00.000Z', origin: 'mcp' },
      },
      warnings: [],
    });
  });
});

/**
 * I3: the read-merge-write is serialized by an O_EXCL lock next to the override file. Without
 * it, a writer that read before a concurrent human lowering would write its stale merge back
 * and silently drop that lowering. `beforeWrite` runs inside the outer writer's critical
 * section, so the inner writer below is deterministically interleaved.
 */
describe('override writes are serialized (I3)', () => {
  const readBack = () => {
    const r = readSessionOverride(project, 's1', { homeDir: home });
    if (!r.ok) throw r.error;
    return r.value.override;
  };

  it('an interleaved writer cannot drop a human lowering', () => {
    let inner: ReturnType<typeof writeSessionOverride> | undefined;
    const outer = writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
      homeDir: home,
      beforeWrite: () => {
        inner = writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', {
          homeDir: home,
          lockTimeoutMs: 30,
        });
      },
    });
    expect(outer.ok).toBe(true);
    expect(inner).toBeDefined();
    // The invariant: a lowering that REPORTED success is in the final file.
    if (inner?.ok) expect(readBack()?.level?.value).toBe('supervised');
    // With the lock, the interleaved writer is refused (busy) rather than silently lost...
    expect(inner?.ok).toBe(false);
    expect(!inner?.ok && (inner?.error as { code?: string }).code).toBe('AUTONOMY_OVERRIDE_BUSY');
    // ...and a retry after the outer write lands, keeping both fields.
    expect(
      writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home }).ok
    ).toBe(true);
    expect(readBack()).toMatchObject({ level: { value: 'supervised' }, audit: { value: true } });
  });

  it('releases the lock after a write (a second write succeeds immediately)', () => {
    const opts = { homeDir: home, lockTimeoutMs: 0 };
    expect(writeSessionOverride(project, 's1', { audit: true }, 'mcp', opts).ok).toBe(true);
    expect(writeSessionOverride(project, 's1', { level: 'supervised' }, 'mcp', opts).ok).toBe(true);
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    if (!p.ok) throw p.error;
    expect(fs.existsSync(`${p.value}.lock`)).toBe(false);
  });

  it('breaks a stale lock left by a crashed writer', () => {
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    if (!p.ok) throw p.error;
    fs.mkdirSync(path.dirname(p.value), { recursive: true });
    fs.writeFileSync(`${p.value}.lock`, '999999');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(`${p.value}.lock`, old, old);
    expect(
      writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
        homeDir: home,
        lockTimeoutMs: 30,
      }).ok
    ).toBe(true);
  });

  it('a fresh lock held by another writer times out with AUTONOMY_OVERRIDE_BUSY, file untouched', () => {
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    if (!p.ok) throw p.error;
    fs.mkdirSync(path.dirname(p.value), { recursive: true });
    fs.writeFileSync(`${p.value}.lock`, '1');
    const w = writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
      homeDir: home,
      lockTimeoutMs: 30,
    });
    expect(w.ok).toBe(false);
    expect(fs.existsSync(p.value)).toBe(false);
    fs.unlinkSync(`${p.value}.lock`);
  });
});
