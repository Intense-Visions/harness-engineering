import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleManageState } from '../../../src/mcp/tools/state';

/** Read all events from the events.jsonl file. */
function readEvents(tmpDir: string) {
  const eventsPath = path.join(tmpDir, '.harness', 'events.jsonl');
  if (!fs.existsSync(eventsPath)) return [];
  return fs
    .readFileSync(eventsPath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('manage_state event emission', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-events-test-'));
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('failure action emits error event', async () => {
    const response = await handleManageState({
      path: tmpDir,
      action: 'failure',
      description: 'Test assertion failed',
      failureType: 'test-failure',
      skillName: 'harness-tdd',
    });
    expect(response.isError).toBeFalsy();

    const events = readEvents(tmpDir);
    expect(events.length).toBeGreaterThanOrEqual(1);

    const errorEvent = events.find((e: { type: string }) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.skill).toBe('harness-tdd');
    expect(errorEvent.summary).toBe('Test assertion failed');
    expect(errorEvent.data.failureType).toBe('test-failure');
  });

  it('gate action emits gate_result event', async () => {
    // Create a minimal package.json so mechanical gate can discover checks
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: {} })
    );

    const response = await handleManageState({
      path: tmpDir,
      action: 'gate',
      skillName: 'harness-execution',
    });
    expect(response.isError).toBeFalsy();

    const events = readEvents(tmpDir);
    const gateEvent = events.find((e: { type: string }) => e.type === 'gate_result');
    expect(gateEvent).toBeDefined();
    expect(gateEvent.skill).toBe('harness-execution');
    expect(typeof gateEvent.data.passed).toBe('boolean');
  });

  it('save-handoff action emits handoff event', async () => {
    const response = await handleManageState({
      path: tmpDir,
      action: 'save-handoff',
      skillName: 'harness-planning',
      handoff: {
        timestamp: new Date().toISOString(),
        fromSkill: 'harness-planning',
        toSkill: 'harness-execution',
        summary: 'Plan complete, ready for execution',
        phase: 'PLAN',
        completed: ['PLAN'],
        pending: ['EXECUTE'],
        concerns: [],
        decisions: [],
        blockers: [],
        contextKeywords: [],
      },
    });
    expect(response.isError).toBeFalsy();

    const events = readEvents(tmpDir);
    const handoffEvent = events.find((e: { type: string }) => e.type === 'handoff');
    expect(handoffEvent).toBeDefined();
    expect(handoffEvent.skill).toBe('harness-planning');
    expect(handoffEvent.data.fromSkill).toBe('harness-planning');
    expect(handoffEvent.data.toSkill).toBe('harness-execution');
  });

  it('phase-start with skillName emits phase_transition event', async () => {
    const response = await handleManageState({
      path: tmpDir,
      action: 'phase-start',
      skillName: 'harness-execution',
      description: 'EXECUTE',
    });
    expect(response.isError).toBeFalsy();

    const events = readEvents(tmpDir);
    const phaseEvent = events.find((e: { type: string }) => e.type === 'phase_transition');
    expect(phaseEvent).toBeDefined();
    expect(phaseEvent.skill).toBe('harness-execution');
    expect(phaseEvent.data.to).toBe('EXECUTE');
  });

  it('phase-complete with skillName emits phase_transition event', async () => {
    const response = await handleManageState({
      path: tmpDir,
      action: 'phase-complete',
      skillName: 'harness-execution',
      description: 'VALIDATE',
    });
    expect(response.isError).toBeFalsy();

    const events = readEvents(tmpDir);
    const phaseEvent = events.find((e: { type: string }) => e.type === 'phase_transition');
    expect(phaseEvent).toBeDefined();
    expect(phaseEvent.skill).toBe('harness-execution');
    expect(phaseEvent.data.from).toBe('VALIDATE');
  });

  it('phase-start without skillName does not emit event', async () => {
    const response = await handleManageState({
      path: tmpDir,
      action: 'phase-start',
    });
    expect(response.isError).toBeFalsy();

    const events = readEvents(tmpDir);
    expect(events).toHaveLength(0);
  });
});
