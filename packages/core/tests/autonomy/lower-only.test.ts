import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isRaisingChange,
  writeLoweringOverride,
  AUTONOMY_RAISE_REJECTED,
} from '../../src/autonomy/lower-only';
import { writeSessionOverride, readSessionOverride } from '../../src/autonomy/override-store';
import { sessionOverridePath } from '../../src/autonomy/paths';

let tmp: string;
let home: string;
let project: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-lower-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const fileBytes = () => {
  const p = sessionOverridePath(project, 's1', { homeDir: home });
  if (!p.ok) throw p.error;
  return fs.existsSync(p.value) ? fs.readFileSync(p.value, 'utf-8') : null;
};

describe('isRaisingChange', () => {
  it.each([
    [{ level: 'trusted' as const }, true],
    [{ audit: false }, true],
    [{ level: 'supervised' as const, audit: false }, true],
    [{ level: 'supervised' as const }, false],
    [{ audit: true }, false],
    [{ level: 'supervised' as const, audit: true }, false],
  ])('%j → %s', (change, expected) => {
    expect(isRaisingChange(change)).toBe(expected);
  });
});

describe('writeLoweringOverride (SC13 core)', () => {
  it.each([
    { level: 'trusted' as const },
    { audit: false },
    { level: 'supervised' as const, audit: false },
  ])('rejects raising change %j and leaves the file byte-identical', (change) => {
    writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home });
    const before = fileBytes();
    const r = writeLoweringOverride(project, 's1', change, { homeDir: home });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r.error as { code?: string }).code).toBe(AUTONOMY_RAISE_REJECTED);
    expect(fileBytes()).toBe(before);
  });
  it('rejects a raise when no file exists, creating nothing', () => {
    expect(writeLoweringOverride(project, 's1', { level: 'trusted' }, { homeDir: home }).ok).toBe(
      false
    );
    expect(fileBytes()).toBeNull();
  });
  it('writes a lowering with origin mcp', () => {
    const r = writeLoweringOverride(
      project,
      's1',
      { level: 'supervised', audit: true },
      { homeDir: home }
    );
    expect(r.ok).toBe(true);
    const back = readSessionOverride(project, 's1', { homeDir: home });
    expect(back.ok && back.value.override?.level?.origin).toBe('mcp');
    expect(back.ok && back.value.override?.audit?.value).toBe(true);
  });
});
