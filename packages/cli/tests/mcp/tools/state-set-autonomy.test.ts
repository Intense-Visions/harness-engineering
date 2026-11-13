import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  resolveAutonomyForSession,
  sessionOverridePath,
  writeSessionOverride,
} from '@harness-engineering/core';
import { manageStateDefinition, handleManageState } from '../../../src/mcp/tools/state';

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
      writeSessionOverride(project, 's1', { level: 'supervised' }, 'cli', { homeDir: home });
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
