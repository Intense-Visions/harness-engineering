import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sessionOverridePath, writeSessionOverride } from '@harness-engineering/core';
import {
  runAutonomySet,
  defaultIsInteractive,
  createAutonomySetCommand,
} from '../../src/commands/autonomy/set';

let tmp: string;
let home: string;
let project: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-autonomy-set-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  // Raises are bound to a live session dir (D14); s1 exists, s2 does not.
  fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const bytes = () => {
  const p = sessionOverridePath(project, 's1', { homeDir: home });
  if (!p.ok) throw p.error;
  return fs.existsSync(p.value) ? fs.readFileSync(p.value, 'utf-8') : null;
};
const T0 = new Date('2026-06-01T00:00:00.000Z');
const H = 3_600_000;
const deps = (interactive: boolean, answer = true) => {
  const confirm = vi.fn(async (_q: string) => answer);
  return {
    confirm,
    d: {
      cwd: () => project,
      homeDir: home,
      env: {},
      now: () => T0,
      isInteractive: () => interactive,
      confirm,
    },
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

  it('the not-a-tty message is accurate: it does not claim an agent cannot raise (I1a)', async () => {
    const out = await runAutonomySet('trusted', { session: 's1' }, deps(false).d);
    expect(out.status === 'refused' && out.message).toMatch(/interactive terminal/);
    // The TTY check stops non-interactive callers; it is not a sandbox (threat model).
    expect(out.status === 'refused' && out.message).not.toMatch(/agent cannot/i);
    expect(out.status === 'refused' && out.message).toMatch(/not a sandbox|does not stop/i);
  });

  it('a refused raise leaves an existing override byte-identical', async () => {
    expect(
      writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home }).ok
    ).toBe(true);
    const before = bytes();
    expect((await runAutonomySet('trusted', { session: 's1' }, deps(false).d)).status).toBe(
      'refused'
    );
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

  it.each(['yolo', 'TRUSTED', 'Supervised'])(
    'S4: level %j is judged by core validateAutonomySetting (one validator)',
    async (level) => {
      const out = await runAutonomySet(level, { session: 's1' }, deps(true).d);
      expect(out).toMatchObject({ status: 'refused', reason: 'invalid' });
      expect(out.status === 'refused' && out.message).toMatch(/^Invalid autonomy setting: level:/);
      expect(bytes()).toBeNull();
    }
  );

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

describe('harness autonomy set: raises are session-bound and expire (I2, D14)', () => {
  const override = () => JSON.parse(bytes() ?? 'null');

  it('refuses a raise for a session with no .harness/sessions/<slug>/ BEFORE prompting', async () => {
    const { confirm, d } = deps(true);
    const out = await runAutonomySet('trusted', { session: 's2' }, d);
    expect(out).toMatchObject({ status: 'refused', reason: 'no-session' });
    expect(out.status === 'refused' && out.message).toMatch(/\.harness[\\/]sessions[\\/]s2/);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a lowering for a session with no session dir is still allowed', async () => {
    const out = await runAutonomySet('supervised', { session: 's2' }, deps(false).d);
    expect(out.status).toBe('written');
  });

  it('a raise expires after 24h by default, and the prompt says so', async () => {
    const { confirm, d } = deps(true);
    const out = await runAutonomySet('trusted', { session: 's1' }, d);
    expect(out.status).toBe('written');
    expect(override().level.expiresAt).toBe(new Date(T0.getTime() + 24 * H).toISOString());
    expect(confirm.mock.calls[0]![0]).toMatch(/24h/);
  });

  it.each([
    ['2h', 2 * H],
    ['90m', 90 * 60_000],
    ['7d', 7 * 24 * H],
  ])('--for %s sets the expiry', async (dur, ms) => {
    const out = await runAutonomySet('trusted', { session: 's1', for: dur }, deps(true).d);
    expect(out.status).toBe('written');
    expect(override().level.expiresAt).toBe(new Date(T0.getTime() + ms).toISOString());
  });

  it.each(['0h', '2', 'h', '-1d', '2w', '1.5h', 'forever'])(
    'rejects --for %j as invalid, no prompt, no write',
    async (dur) => {
      const { confirm, d } = deps(true);
      const out = await runAutonomySet('trusted', { session: 's1', for: dur }, d);
      expect(out).toMatchObject({ status: 'refused', reason: 'invalid' });
      expect(confirm).not.toHaveBeenCalled();
      expect(bytes()).toBeNull();
    }
  );

  it('rejects --for on a lowering (lowerings are permanent)', async () => {
    const out = await runAutonomySet('supervised', { session: 's1', for: '2h' }, deps(false).d);
    expect(out).toMatchObject({ status: 'refused', reason: 'invalid' });
    expect(out.status === 'refused' && out.message).toMatch(/permanent/);
  });
});

describe('harness autonomy set: raise audit line (I1c, D16)', () => {
  const log = () => {
    const p = path.join(home, '.harness', 'autonomy-audit.log');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean) : [];
  };

  it('a confirmed raise appends exactly one line (origin cli)', async () => {
    const out = await runAutonomySet('trusted', { session: 's1', audit: 'off' }, deps(true).d);
    expect(out.status).toBe('written');
    const lines = log();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      session: 's1',
      origin: 'cli',
      to: { level: 'trusted', audit: false },
      ts: T0.toISOString(),
    });
  });

  it('a declined raise and a lowering append nothing', async () => {
    expect((await runAutonomySet('trusted', { session: 's1' }, deps(true, false).d)).status).toBe(
      'refused'
    );
    expect(
      (await runAutonomySet('supervised', { session: 's1', audit: 'on' }, deps(false).d)).status
    ).toBe('written');
    expect(log()).toEqual([]);
  });
});

describe('harness autonomy set: --audit without a level, readable confirm (S5)', () => {
  const override = () => JSON.parse(bytes() ?? 'null');

  it('--audit off alone raises only audit (after confirm) and leaves level unset', async () => {
    const { confirm, d } = deps(true);
    const out = await runAutonomySet(undefined, { session: 's1', audit: 'off' }, d);
    expect(out.status).toBe('written');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(override().level).toBeUndefined();
    expect(override().audit).toMatchObject({ value: false, origin: 'cli' });
  });

  it('--audit on alone is a lowering: no TTY, no prompt', async () => {
    const { confirm, d } = deps(false);
    const out = await runAutonomySet(undefined, { session: 's1', audit: 'on' }, d);
    expect(out.status).toBe('written');
    expect(confirm).not.toHaveBeenCalled();
    expect(override().level).toBeUndefined();
  });

  it('neither a level nor --audit is invalid', async () => {
    const out = await runAutonomySet(undefined, { session: 's1' }, deps(true).d);
    expect(out).toMatchObject({ status: 'refused', reason: 'invalid' });
  });

  it.each([
    ['trusted', 'off', 'level=trusted, audit=off'],
    ['trusted', undefined, 'level=trusted'],
    [undefined, 'off', 'audit=off'],
  ])('confirm for level=%s audit=%s reads %j (no JSON)', async (level, audit, text) => {
    const { confirm, d } = deps(true);
    const out = await runAutonomySet(
      level,
      { session: 's1', ...(audit !== undefined && { audit }) },
      d
    );
    expect(out.status).toBe('written');
    const q = confirm.mock.calls[0]![0];
    expect(q).toContain(text);
    expect(q).not.toMatch(/[{}"]level|"audit"/);
  });

  it('the command accepts `set --audit off --session s1` (level is optional)', () => {
    const arg = createAutonomySetCommand().registeredArguments[0]!;
    expect(arg.required).toBe(false);
  });
});
