import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { emitSkillEvent } from '../../../src/mcp/tools/event-emitter';

describe('emitSkillEvent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-emitter-test-'));
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes event to events.jsonl', async () => {
    await emitSkillEvent(tmpDir, {
      skill: 'harness-tdd',
      type: 'phase_transition',
      summary: 'test phase transition',
      data: { from: 'investigate', to: 'fix' },
    });

    const eventsPath = path.join(tmpDir, '.harness', 'events.jsonl');
    expect(fs.existsSync(eventsPath)).toBe(true);

    const content = fs.readFileSync(eventsPath, 'utf-8').trim();
    const event = JSON.parse(content);
    expect(event.skill).toBe('harness-tdd');
    expect(event.type).toBe('phase_transition');
    expect(event.summary).toBe('test phase transition');
    expect(event.data).toEqual({ from: 'investigate', to: 'fix' });
    expect(event.timestamp).toBeTruthy();
    expect(event.contentHash).toBeTruthy();
  });

  it('writes multiple events as separate lines', async () => {
    await emitSkillEvent(tmpDir, {
      skill: 'harness-execution',
      type: 'phase_transition',
      summary: 'entering EXECUTE',
      data: { from: 'PREPARE', to: 'EXECUTE' },
    });

    await emitSkillEvent(tmpDir, {
      skill: 'harness-execution',
      type: 'gate_result',
      summary: 'gate passed',
      data: { passed: true, checks: [{ name: 'test', passed: true }] },
    });

    const eventsPath = path.join(tmpDir, '.harness', 'events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);

    const event1 = JSON.parse(lines[0]!);
    expect(event1.type).toBe('phase_transition');

    const event2 = JSON.parse(lines[1]!);
    expect(event2.type).toBe('gate_result');
  });

  it('deduplicates identical events', async () => {
    const event = {
      skill: 'harness-tdd',
      type: 'error' as const,
      summary: 'test failed',
    };

    await emitSkillEvent(tmpDir, event);
    await emitSkillEvent(tmpDir, event);

    const eventsPath = path.join(tmpDir, '.harness', 'events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('silently handles errors for invalid paths', async () => {
    // Should not throw — event emission is fire-and-forget
    await expect(
      emitSkillEvent('/nonexistent/path/that/cannot/exist', {
        skill: 'test',
        type: 'error',
        summary: 'test',
      })
    ).resolves.toBeUndefined();
  });

  it('writes events compatible with adoption-tracker format', async () => {
    await emitSkillEvent(tmpDir, {
      skill: 'harness-debugging',
      type: 'phase_transition',
      summary: 'investigate -> analyze',
      data: { from: 'investigate', to: 'analyze' },
    });

    await emitSkillEvent(tmpDir, {
      skill: 'harness-debugging',
      type: 'handoff',
      summary: 'session handoff',
      data: { fromSkill: 'harness-debugging' },
    });

    const eventsPath = path.join(tmpDir, '.harness', 'events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');

    // Each event must have skill, type, timestamp (adoption-tracker requirements)
    for (const line of lines) {
      const event = JSON.parse(line);
      expect(event.skill).toBeTruthy();
      expect(event.type).toBeTruthy();
      expect(event.timestamp).toBeTruthy();
    }
  });
});
