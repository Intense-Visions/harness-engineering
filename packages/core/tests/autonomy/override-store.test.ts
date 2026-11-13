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
