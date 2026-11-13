import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { writeSessionOverride } from '@harness-engineering/core';
import {
  gatherContextDefinition,
  handleGatherContext,
} from '../../../src/mcp/tools/gather-context';
import { handleManageState } from '../../../src/mcp/tools/state';

let tmp: string;
let home: string;
let project: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-autonomy-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const gather = async (extra: Record<string, unknown>, env: NodeJS.ProcessEnv = {}) => {
  const res = await handleGatherContext(
    { path: project, intent: 'autonomy test', include: ['autonomy'], ...extra } as Parameters<
      typeof handleGatherContext
    >[0],
    { homeDir: home, env }
  );
  return JSON.parse(res.content[0]!.text);
};

describe('gather_context autonomy include', () => {
  it('declares autonomy in the include enum', () => {
    expect(gatherContextDefinition.inputSchema.properties.include.items.enum).toContain('autonomy');
  });
  it('returns the default when nothing is configured', async () => {
    const out = await gather({});
    expect(out.autonomy).toMatchObject({
      level: 'supervised',
      audit: false,
      source: { level: 'default', audit: 'default' },
    });
  });
  it('reflects a session override, then a mid-session lowering (SC7 tool level)', async () => {
    fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
    expect(
      writeSessionOverride(project, 's1', { level: 'trusted' }, 'cli', { homeDir: home }).ok
    ).toBe(true);
    expect((await gather({ session: 's1' })).autonomy.level).toBe('trusted');
    await handleManageState(
      {
        path: project,
        action: 'set-autonomy',
        session: 's1',
        level: 'supervised',
      } as Parameters<typeof handleManageState>[0],
      { homeDir: home }
    );
    const out = await gather({ session: 's1' });
    expect([out.autonomy.level, out.autonomy.source.level]).toEqual(['supervised', 'session']);
  });
  it('honours a LOWERING env', async () => {
    fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.harness', 'config.json'),
      JSON.stringify({ autonomy: { level: 'trusted' } })
    );
    const out = await gather({}, { HARNESS_AUTONOMY: 'supervised' });
    expect([out.autonomy.level, out.autonomy.source.level]).toEqual(['supervised', 'env']);
  });
  it('C1/D13: a project .env loaded into the MCP env (as roadmap-auto-sync does) cannot raise', async () => {
    // triggerExternalSync loads <project>/.env into the MCP server's process env at runtime.
    fs.writeFileSync(
      path.join(project, '.env'),
      'HARNESS_AUTONOMY=trusted\nHARNESS_AUTONOMY_AUDIT=off\n'
    );
    const mcpEnv: NodeJS.ProcessEnv = {};
    loadDotenv({ path: path.join(project, '.env'), processEnv: mcpEnv as Record<string, string> });
    // Positive control: the .env really did reach the env the tool reads.
    expect(mcpEnv.HARNESS_AUTONOMY).toBe('trusted');
    const out = await gather({}, mcpEnv);
    expect(out.autonomy).toMatchObject({ level: 'supervised', audit: false });
    expect(out.autonomy.source.level).not.toBe('env');
    expect(out.autonomy.source.audit).not.toBe('env');
    expect(out.autonomy.warnings.join('\n')).toContain('HARNESS_AUTONOMY="trusted"');
  });
  it('ignores autonomy keys in the project config (SC5 at tool level)', async () => {
    fs.writeFileSync(
      path.join(project, 'harness.config.json'),
      JSON.stringify({ version: 1, autonomy: { level: 'trusted' } })
    );
    expect((await gather({})).autonomy.source.level).toBe('default');
  });
  it('omits the autonomy key when not requested', async () => {
    const res = await handleGatherContext(
      { path: project, intent: 'x', include: ['handoff'] } as Parameters<
        typeof handleGatherContext
      >[0],
      { homeDir: home, env: {} }
    );
    expect('autonomy' in JSON.parse(res.content[0]!.text)).toBe(false);
  });
});
