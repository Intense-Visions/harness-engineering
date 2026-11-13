import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  recordAutoDecisionDefinition,
  handleRecordAutoDecision,
} from '../../../src/mcp/tools/auto-decision';

let tmp: string;
let home: string;
let project: string;
const NOW = '2026-11-13T12:00:00.000Z';
const ceremony = {
  skill: 'harness-planning',
  phase: 'VALIDATE',
  pauseClass: 'ceremony',
  question: 'Approve plan?',
  options: ['approve'],
  chosen: 'approve',
  rationale: 'all truths traced',
};
const call = (args: Record<string, unknown>) =>
  handleRecordAutoDecision(
    { path: project, session: 's1', ...ceremony, ...args },
    { homeDir: home, env: {}, now: () => new Date(NOW) }
  );
const body = (r: Awaited<ReturnType<typeof call>>) => JSON.parse(r.content[0]?.text ?? '{}');
const logFile = () => path.join(project, '.harness', 'sessions', 's1', 'auto-decisions.jsonl');
const trusted = () => {
  fs.mkdirSync(path.join(home, '.harness'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.harness', 'config.json'),
    JSON.stringify({ autonomy: { level: 'trusted' } })
  );
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-auto-decision-'));
  home = path.join(tmp, 'home');
  project = path.join(tmp, 'project');
  fs.mkdirSync(path.join(project, '.harness', 'sessions', 's1'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('record_auto_decision definition', () => {
  it('is named, requires the entry fields, and offers only ceremony/judgment', () => {
    expect(recordAutoDecisionDefinition.name).toBe('record_auto_decision');
    const schema = recordAutoDecisionDefinition.inputSchema as {
      required: string[];
      properties: Record<string, { enum?: string[] }>;
    };
    expect(schema.required).toEqual([
      'path',
      'session',
      'skill',
      'phase',
      'pauseClass',
      'question',
      'options',
      'chosen',
      'rationale',
    ]);
    expect(schema.properties.pauseClass?.enum).toEqual(['ceremony', 'judgment']);
    expect(schema.properties.autonomySource).toBeUndefined();
    expect(schema.properties.ts).toBeUndefined();
  });
});

describe('record_auto_decision handler', () => {
  it('appends one stamped line and returns recorded:true', async () => {
    trusted();
    const r = await call({});
    expect(r.isError).toBeFalsy();
    expect(body(r)).toMatchObject({
      recorded: true,
      entry: { ts: NOW, autonomySource: 'user-config' },
    });
    expect(fs.readFileSync(logFile(), 'utf-8').trim().split('\n')).toHaveLength(1);
  });
  it('rejects a spoofed autonomySource with a structured error and writes nothing', async () => {
    trusted();
    const r = await call({ autonomySource: 'flag' });
    expect(r.isError).toBe(true);
    expect(body(r)).toMatchObject({
      recorded: false,
      error: 'AUTO_DECISION_INVALID',
      field: 'autonomySource',
      action: 'pause',
    });
    expect(fs.existsSync(logFile())).toBe(false);
  });
  it('rejects mistyped args (MCP args arrive unvalidated)', async () => {
    trusted();
    expect(body(await call({ options: 'approve' }))).toMatchObject({
      error: 'AUTO_DECISION_INVALID',
      field: 'options',
    });
  });
  it('refuses while supervised (fail-safe: the skill pauses)', async () => {
    expect(body(await call({}))).toMatchObject({
      recorded: false,
      error: 'AUTO_DECISION_NOT_AUTHORIZED',
      action: 'pause',
    });
  });
  it('refuses a fabricated escalation while supervised (review I1)', async () => {
    const r = await call({
      pauseClass: 'judgment',
      question: 'Run the tests?',
      options: ['run tests', 'skip tests'],
      chosen: 'skip tests',
      audit: { status: 'escalated', blindPick: 'run tests', humanChoice: 'skip tests' },
    });
    expect(r.isError).toBe(true);
    expect(body(r)).toMatchObject({ recorded: false, error: 'AUTO_DECISION_NOT_AUTHORIZED' });
    expect(fs.existsSync(logFile())).toBe(false);
  });
  it('makes a failed write unambiguous (SC14)', async () => {
    trusted();
    fs.mkdirSync(logFile());
    const r = await call({});
    expect(r.isError).toBe(true);
    expect(body(r)).toMatchObject({
      recorded: false,
      error: 'AUTO_DECISION_WRITE_FAILED',
      action: 'pause',
    });
  });
});
