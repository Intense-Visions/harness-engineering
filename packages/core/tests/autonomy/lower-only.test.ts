import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isRaisingChange,
  writeLoweringOverride,
  AUTONOMY_RAISE_REJECTED,
  AUTONOMY_INVALID_SETTING,
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
    expect(
      writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home }).ok
    ).toBe(true);
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

/**
 * FIX 1b (D12/SC13): the MCP layer does not schema-validate args, so a non-boolean `audit`
 * like "false" slipped past the value-based raise check and was written verbatim. The core
 * writers validate their own input so no caller can bypass the handler's validation.
 */
describe('writer input validation (type-confusion, D12)', () => {
  const confused: Array<Record<string, unknown>> = [
    { audit: 'false' },
    { audit: 'true' },
    { audit: null },
    { audit: 0 },
    { level: 'TRUSTED' },
    { level: 'supervised', audit: 'false' },
  ];

  it.each(confused)(
    'writeLoweringOverride rejects %j with AUTONOMY_INVALID_SETTING, file unchanged',
    (change) => {
      expect(
        writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home }).ok
      ).toBe(true);
      const before = fileBytes();
      const r = writeLoweringOverride(project, 's1', change as never, { homeDir: home });
      expect(r.ok).toBe(false);
      if (!r.ok) expect((r.error as { code?: string }).code).toBe(AUTONOMY_INVALID_SETTING);
      expect(fileBytes()).toBe(before);
    }
  );

  it.each(confused)('writeSessionOverride rejects %j and creates nothing', (change) => {
    const r = writeSessionOverride(project, 's1', change as never, 'cli', { homeDir: home });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r.error as { code?: string }).code).toBe(AUTONOMY_INVALID_SETTING);
    expect(fileBytes()).toBeNull();
  });

  it('positive control: a well-typed lowering still writes', () => {
    expect(writeLoweringOverride(project, 's1', { audit: true }, { homeDir: home }).ok).toBe(true);
    expect(fileBytes()).not.toBeNull();
  });

  it.each([{ audit: 'false' }, { audit: null }, { audit: 0 }, { level: 'TRUSTED' }])(
    'isRaisingChange fails closed on non-lowering value %j',
    (change) => {
      expect(isRaisingChange(change as never)).toBe(true);
    }
  );
});
