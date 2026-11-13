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
    const w = writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', {
      homeDir: home,
      now: at('2026-01-01T00:00:00.000Z'),
    });
    expect(w.ok).toBe(true);
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    expect(p.ok && fs.existsSync(p.value)).toBe(true);
    expect(p.ok && p.value.replaceAll('\\', '/')).toContain('/home/.harness/session-overrides/');
    expect(fs.existsSync(path.join(project, '.harness'))).toBe(false);
    const back = readSessionOverride(project, 's1', { homeDir: home });
    expect(back.ok && back.value.override).toEqual({
      level: { value: 'trusted', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' },
    });
  });

  it('updating one field preserves the other field and its timestamp', () => {
    writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', {
      homeDir: home,
      now: at('2026-01-01T00:00:00.000Z'),
    });
    const w = writeSessionOverride(project, 's1', { audit: true }, 'mcp', {
      homeDir: home,
      now: at('2026-01-02T00:00:00.000Z'),
    });
    expect(w.ok && w.value).toEqual({
      level: { value: 'trusted', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' },
      audit: { value: true, setAt: '2026-01-02T00:00:00.000Z', origin: 'mcp' },
    });
  });

  it('ignores a malformed file with a warning, and a write replaces it', () => {
    const p = sessionOverridePath(project, 's1', { homeDir: home });
    if (!p.ok) throw p.error;
    fs.mkdirSync(path.dirname(p.value), { recursive: true });
    fs.writeFileSync(p.value, '{nope');
    const r = readSessionOverride(project, 's1', { homeDir: home });
    expect(r.ok && r.value.override).toBeNull();
    expect(r.ok && r.value.warnings).toHaveLength(1);
    expect(writeSessionOverride(project, 's1', { audit: true }, 'mcp', { homeDir: home }).ok).toBe(
      true
    );
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
 * FIX 1c (D12): a schema failure in ONE field must not discard the whole override. Before
 * this, a corrupt `audit` erased a human-set `level: supervised` lowering, so the next
 * resolve fell through to a `trusted` user config — a raise by corruption.
 */
describe('per-field degradation on read', () => {
  const LEVEL = { value: 'supervised', setAt: '2026-01-01T00:00:00.000Z', origin: 'cli' };
  const AUDIT = { value: true, setAt: '2026-01-02T00:00:00.000Z', origin: 'mcp' };
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

  it.each([
    ['string "false"', { ...AUDIT, value: 'false' }],
    ['null', { ...AUDIT, value: null }],
    ['0', { ...AUDIT, value: 0 }],
    ['bad origin', { ...AUDIT, origin: 'agent' }],
    ['bad setAt', { ...AUDIT, setAt: 'yesterday' }],
    ['non-object', 'false'],
  ])('a corrupt audit (%s) is dropped with a warning; the valid level survives', (_n, audit) => {
    writeRaw({ level: LEVEL, audit });
    const r = read();
    expect(r.override).toEqual({ level: LEVEL });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/audit/);
  });

  it('a corrupt level is dropped; the valid audit survives', () => {
    writeRaw({ level: { ...LEVEL, value: 'TRUSTED' }, audit: AUDIT });
    const r = read();
    expect(r.override).toEqual({ audit: AUDIT });
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/level/);
  });

  it('both fields corrupt → null override with one warning per field', () => {
    writeRaw({ level: 'trusted', audit: 'false' });
    const r = read();
    expect(r.override).toBeNull();
    expect(r.warnings).toHaveLength(2);
  });

  it.each([['[]'], ['"x"'], ['null'], ['{nope']])(
    'a non-object / unparseable document (%s) → null override with a warning',
    (raw) => {
      writeRaw(raw);
      const r = read();
      expect(r.override).toBeNull();
      expect(r.warnings).toHaveLength(1);
    }
  );

  it('positive control: a fully valid document reads back with no warnings', () => {
    writeRaw({ level: LEVEL, audit: AUDIT });
    expect(read()).toEqual({ override: { level: LEVEL, audit: AUDIT }, warnings: [] });
  });

  it('a later write repairs the corrupt field and keeps the valid one', () => {
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
