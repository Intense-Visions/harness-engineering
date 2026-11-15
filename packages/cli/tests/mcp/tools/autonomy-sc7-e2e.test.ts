// SC7 end to end: a mid-session lowering through the agent-callable path takes effect at
// the very next pause, as observed through the same three MCP tools a skill uses, and
// leaves earlier log entries byte-identical.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleGatherContext } from '../../../src/mcp/tools/gather-context';
import { handleManageState } from '../../../src/mcp/tools/state';
import { handleRecordAutoDecision } from '../../../src/mcp/tools/auto-decision';

let tmp: string;
let home: string;
let project: string;
const NOW = '2026-11-13T12:00:00.000Z';
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-sc7-e2e-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
  fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.harness', 'config.json'),
    JSON.stringify({ autonomy: { level: 'trusted' } })
  );
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const autonomy = async () =>
  JSON.parse(
    (
      await handleGatherContext(
        { path: project, intent: 'sc7', include: ['autonomy'], session: 's1' } as Parameters<
          typeof handleGatherContext
        >[0],
        { homeDir: home, env: {} }
      )
    ).content[0]!.text
  ).autonomy;
const pause = (question: string) =>
  handleRecordAutoDecision(
    {
      path: project,
      session: 's1',
      skill: 'harness-planning',
      phase: 'VALIDATE',
      pauseClass: 'ceremony',
      question,
      options: ['approve', 'revise'],
      chosen: 'approve',
      rationale: 'all truths traced',
    },
    { homeDir: home, env: {}, now: () => new Date(NOW) }
  );
const body = (r: Awaited<ReturnType<typeof pause>>) => JSON.parse(r.content[0]?.text ?? '{}');
const logFile = () => path.join(project, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');

describe('SC7 end to end', () => {
  it('a set-autonomy lowering applies at the next pause; the earlier entry is unchanged', async () => {
    expect(await autonomy()).toMatchObject({
      level: 'trusted',
      source: { level: 'user-config' },
    });
    const first = await pause('Approve the plan for phase 1?');
    expect(first.isError).toBeFalsy(); // positive control: trusted really records
    expect(body(first)).toMatchObject({ recorded: true });
    const before = fs.readFileSync(logFile());

    const lowered = await handleManageState(
      {
        path: project,
        action: 'set-autonomy',
        session: 's1',
        level: 'supervised',
      } as Parameters<typeof handleManageState>[0],
      { homeDir: home }
    );
    expect(lowered.isError).toBeFalsy();

    expect(await autonomy()).toMatchObject({
      level: 'supervised',
      source: { level: 'session' },
    });
    const second = await pause('Approve the plan for phase 2?');
    expect(second.isError).toBe(true);
    expect(body(second)).toMatchObject({
      recorded: false,
      error: 'AUTO_DECISION_NOT_AUTHORIZED',
      action: 'pause',
    });
    expect(fs.readFileSync(logFile()).equals(before)).toBe(true);
  });
});
