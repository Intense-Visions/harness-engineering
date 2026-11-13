import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  resolveAutonomyForSession,
  sessionOverridePath,
  writeSessionOverride,
} from '@harness-engineering/core';
import { createHash } from 'node:crypto';
import { manageStateDefinition, handleManageState } from '../../../src/mcp/tools/state';
import { runAutonomyShow } from '../../../src/commands/autonomy/show';

let tmp: string;
let home: string;
let project: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-set-autonomy-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const call = (extra: Record<string, unknown>) =>
  handleManageState(
    { path: project, action: 'set-autonomy', session: 's1', ...extra } as Parameters<
      typeof handleManageState
    >[0],
    { homeDir: home }
  );
const bytes = () => {
  const p = sessionOverridePath(project, 's1', { homeDir: home });
  if (!p.ok) throw p.error;
  return fs.existsSync(p.value) ? fs.readFileSync(p.value, 'utf-8') : null;
};

describe('manage_state set-autonomy', () => {
  it('is declared in the schema with level and audit inputs', () => {
    const props = manageStateDefinition.inputSchema.properties as Record<
      string,
      { enum?: string[] }
    >;
    expect(props.action.enum).toContain('set-autonomy');
    expect(props.level.enum).toEqual(['supervised', 'trusted']);
    expect(props).toHaveProperty('audit');
  });

  it('lowers: writes an mcp-origin override in the home dir that the next resolve returns', async () => {
    const res = await call({ level: 'supervised', audit: true });
    expect(res.isError).toBeFalsy();
    const r = resolveAutonomyForSession({
      projectPath: project,
      session: 's1',
      env: {},
      homeDir: home,
    });
    expect([r.level, r.source.level, r.audit, r.source.audit]).toEqual([
      'supervised',
      'session',
      true,
      'session',
    ]);
    expect(fs.existsSync(path.join(project, '.harness'))).toBe(false);
  });

  it.each([{ level: 'trusted' }, { audit: false }, { level: 'supervised', audit: false }])(
    'rejects raise %j with a structured error and leaves the override unchanged (SC13)',
    async (change) => {
      expect(
        writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home }).ok
      ).toBe(true);
      const before = bytes();
      const res = await call(change);
      expect(res.isError).toBe(true);
      expect(JSON.parse(res.content[0]!.text).error).toBe('AUTONOMY_RAISE_REJECTED');
      expect(bytes()).toBe(before);
    }
  );

  it('requires a session, a valid level, and at least one field', async () => {
    const noSession = await handleManageState(
      { path: project, action: 'set-autonomy', level: 'supervised' } as Parameters<
        typeof handleManageState
      >[0],
      { homeDir: home }
    );
    expect(noSession.isError).toBe(true);
    expect((await call({ level: 'yolo' })).isError).toBe(true);
    expect((await call({})).isError).toBe(true);
    expect(bytes()).toBeNull();
  });
});

/**
 * FIX 1a (D12/SC13): MCP args are not schema-validated before handlers, so audit:"false" (a
 * string) slipped past the value-based raise check, was written verbatim, and on the next
 * read the corrupt file erased the human's level=supervised lowering.
 */
describe('manage_state set-autonomy type-confusion (SC13)', () => {
  const sha = () => {
    const b = bytes();
    return b === null ? null : createHash('sha256').update(b).digest('hex');
  };
  const seed = () => {
    // User config: trusted + audit off. Human lowered to supervised (cli); agent set audit on (mcp).
    fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.harness', 'config.json'),
      JSON.stringify({
        autonomy: { level: 'trusted', audit: { trusted: false, supervised: false } },
      })
    );
    const a = writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', {
      homeDir: home,
    });
    if (!a.ok) throw a.error;
  };
  const show = () =>
    runAutonomyShow({ session: 's1' }, { cwd: () => project, homeDir: home, env: {} });

  it('exact reproduction: audit:"false" is rejected, file sha unchanged, show still supervised/session', async () => {
    seed();
    expect((await call({ audit: true })).isError).toBeFalsy();
    const before = sha();
    expect(before).not.toBeNull();
    expect([show().level, show().source.level]).toEqual(['supervised', 'session']);

    const res = await call({ audit: 'false' });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0]!.text);
    expect(body).toMatchObject({ error: 'AUTONOMY_INVALID_INPUT', field: 'audit' });

    expect(sha()).toBe(before);
    const r = show();
    expect([r.level, r.source.level, r.audit, r.source.audit]).toEqual([
      'supervised',
      'session',
      true,
      'session',
    ]);
    expect(r.warnings).toEqual([]);
  });

  it.each([
    ['audit', { audit: null }],
    ['audit', { audit: 0 }],
    ['audit', { audit: 'true' }],
    ['audit', { audit: 'false' }],
    ['audit', { level: 'supervised', audit: 'false' }],
    ['level', { level: 'TRUSTED' }],
    ['level', { level: 0 }],
    ['level', { level: null }],
  ])(
    'rejects mistyped %s in %j with AUTONOMY_INVALID_INPUT and writes nothing',
    async (field, change) => {
      seed();
      const before = sha();
      const res = await call(change);
      expect(res.isError).toBe(true);
      expect(JSON.parse(res.content[0]!.text)).toMatchObject({
        error: 'AUTONOMY_INVALID_INPUT',
        field,
      });
      expect(sha()).toBe(before);
    }
  );

  it('S3: validation is delegated to core (one validator, one error code at the boundary)', async () => {
    const res = await call({ audit: 'false' });
    const body = JSON.parse(res.content[0]!.text);
    expect(body.error).toBe('AUTONOMY_INVALID_INPUT');
    expect(body.error).not.toBe('AUTONOMY_INVALID_SETTING');
    // The message is core's validateAutonomySetting message, not a handler-local rewording.
    expect(body.message).toMatch(/^Invalid autonomy setting: audit:/);
  });

  it('positive control: a well-typed lowering on the same seed still succeeds', async () => {
    seed();
    const before = sha();
    expect((await call({ audit: true })).isError).toBeFalsy();
    expect(sha()).not.toBe(before);
  });
});

describe('manage_state set-autonomy session validation (S1)', () => {
  it.each([[42], [{}], [['s1']], [true], [''], ['CON'], ['../x']])(
    'rejects session %j with a structured AUTONOMY_INVALID_INPUT naming the field',
    async (session) => {
      const res = await handleManageState(
        {
          path: project,
          action: 'set-autonomy',
          session,
          level: 'supervised',
        } as unknown as Parameters<typeof handleManageState>[0],
        { homeDir: home }
      );
      expect(res.isError).toBe(true);
      expect(JSON.parse(res.content[0]!.text)).toMatchObject({
        error: 'AUTONOMY_INVALID_INPUT',
        field: 'session',
      });
      expect(fs.existsSync(home)).toBe(false);
    }
  );

  it('a missing session is the same structured error', async () => {
    const res = await handleManageState(
      { path: project, action: 'set-autonomy', level: 'supervised' } as Parameters<
        typeof handleManageState
      >[0],
      { homeDir: home }
    );
    expect(JSON.parse(res.content[0]!.text)).toMatchObject({
      error: 'AUTONOMY_INVALID_INPUT',
      field: 'session',
    });
  });
});
