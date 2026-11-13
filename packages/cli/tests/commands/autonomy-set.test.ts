import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sessionOverridePath, writeSessionOverride } from '@harness-engineering/core';
import { runAutonomySet, defaultIsInteractive } from '../../src/commands/autonomy/set';

let tmp: string;
let home: string;
let project: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-autonomy-set-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const bytes = () => {
  const p = sessionOverridePath(project, 's1', { homeDir: home });
  if (!p.ok) throw p.error;
  return fs.existsSync(p.value) ? fs.readFileSync(p.value, 'utf-8') : null;
};
const deps = (interactive: boolean, answer = true) => {
  const confirm = vi.fn(async () => answer);
  return {
    confirm,
    d: { cwd: () => project, homeDir: home, env: {}, isInteractive: () => interactive, confirm },
  };
};

describe('harness autonomy set', () => {
  it.each([
    ['trusted', {}],
    ['supervised', { audit: 'off' }],
  ])(
    'refuses raise %s %j without a TTY, never prompts, writes nothing (SC13)',
    async (level, extra) => {
      const { confirm, d } = deps(false);
      const out = await runAutonomySet(level, { session: 's1', ...extra }, d);
      expect(out).toMatchObject({ status: 'refused', reason: 'not-a-tty' });
      expect(confirm).not.toHaveBeenCalled();
      expect(bytes()).toBeNull();
    }
  );

  it('a refused raise leaves an existing override byte-identical', async () => {
    writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home });
    const before = bytes();
    await runAutonomySet('trusted', { session: 's1' }, deps(false).d);
    expect(bytes()).toBe(before);
  });

  it('raises on a TTY after an explicit yes, with origin cli', async () => {
    const { confirm, d } = deps(true, true);
    const out = await runAutonomySet('trusted', { session: 's1', audit: 'on' }, d);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(out.status).toBe('written');
    if (out.status === 'written') {
      expect(out.override.level).toMatchObject({ value: 'trusted', origin: 'cli' });
    }
  });

  it('a declined confirm writes nothing', async () => {
    const out = await runAutonomySet('trusted', { session: 's1' }, deps(true, false).d);
    expect(out).toMatchObject({ status: 'refused', reason: 'declined' });
    expect(bytes()).toBeNull();
  });

  it('lowering needs no TTY and no prompt', async () => {
    const { confirm, d } = deps(false);
    const out = await runAutonomySet('supervised', { session: 's1', audit: 'on' }, d);
    expect(out.status).toBe('written');
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    ['yolo', {}],
    ['supervised', { audit: 'maybe' }],
  ])('rejects invalid input %s %j', async (level, extra) => {
    const out = await runAutonomySet(level, { session: 's1', ...extra }, deps(true).d);
    expect(out).toMatchObject({ status: 'refused', reason: 'invalid' });
    expect(bytes()).toBeNull();
  });

  it('the production TTY probe is false when stdin is not a TTY', () => {
    const desc = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
    try {
      expect(defaultIsInteractive()).toBe(false);
    } finally {
      if (desc) Object.defineProperty(process.stdin, 'isTTY', desc);
      else delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
  });
});
