import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SkillEventSchema,
  emitEvent,
  loadEvents,
  formatEventTimeline,
} from '../../src/state/events';
import type { SkillEvent } from '../../src/state/events';

describe('SkillEventSchema', () => {
  it('should validate a valid phase_transition event', () => {
    const event = {
      timestamp: '2026-03-30T10:30:00Z',
      skill: 'harness-execution',
      type: 'phase_transition',
      summary: 'Moved from PREPARE to EXECUTE',
      data: { from: 'PREPARE', to: 'EXECUTE', taskCount: 12 },
    };
    const result = SkillEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('should validate event with all optional fields', () => {
    const event = {
      timestamp: '2026-03-30T10:30:00Z',
      skill: 'harness-execution',
      session: 'my-session',
      type: 'decision',
      summary: 'Use polling over WebSocket',
      data: { what: 'Use polling', why: 'Simpler' },
      refs: ['src/api/polling.ts'],
      contentHash: 'abc123',
    };
    const result = SkillEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('should reject event with invalid type', () => {
    const event = {
      timestamp: '2026-03-30T10:30:00Z',
      skill: 'harness-execution',
      type: 'invalid_type',
      summary: 'Bad event',
    };
    const result = SkillEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('should reject event missing required fields', () => {
    const event = {
      timestamp: '2026-03-30T10:30:00Z',
      // missing skill, type, summary
    };
    const result = SkillEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

describe('emitEvent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-events-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should write a JSONL line to events.jsonl', async () => {
    const result = await emitEvent(tmpDir, {
      skill: 'harness-execution',
      type: 'phase_transition',
      summary: 'Moved from PREPARE to EXECUTE',
      data: { from: 'PREPARE', to: 'EXECUTE', taskCount: 5 },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.written).toBe(true);
    }

    const eventsPath = path.join(tmpDir, '.harness', 'events.jsonl');
    expect(fs.existsSync(eventsPath)).toBe(true);

    const content = fs.readFileSync(eventsPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);

    const event = JSON.parse(lines[0]!);
    expect(event.skill).toBe('harness-execution');
    expect(event.type).toBe('phase_transition');
    expect(event.timestamp).toBeDefined();
    expect(event.contentHash).toBeDefined();
  });

  it('should write to session-scoped directory', async () => {
    const sessionSlug = 'test-session';
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', sessionSlug);
    fs.mkdirSync(sessionDir, { recursive: true });

    const result = await emitEvent(
      tmpDir,
      {
        skill: 'harness-execution',
        type: 'decision',
        summary: 'Use polling over WebSocket',
      },
      { session: sessionSlug }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.written).toBe(true);
    }

    const eventsPath = path.join(sessionDir, 'events.jsonl');
    expect(fs.existsSync(eventsPath)).toBe(true);
  });

  it('should skip duplicate events (same skill, type, summary, session)', async () => {
    const event = {
      skill: 'harness-execution',
      type: 'decision' as const,
      summary: 'Use polling over WebSocket',
    };

    const result1 = await emitEvent(tmpDir, event);
    expect(result1.ok).toBe(true);
    if (result1.ok) expect(result1.value.written).toBe(true);

    const result2 = await emitEvent(tmpDir, event);
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.value.written).toBe(false);
      expect(result2.value.reason).toBe('duplicate');
    }

    // Verify only one line was written
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'events.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);
  });

  it('should allow same summary with different type', async () => {
    await emitEvent(tmpDir, {
      skill: 'harness-execution',
      type: 'decision',
      summary: 'Test event',
    });
    const result = await emitEvent(tmpDir, {
      skill: 'harness-execution',
      type: 'checkpoint',
      summary: 'Test event',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.written).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'events.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
  });
});

describe('loadEvents', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-events-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no events file exists', async () => {
    const result = await loadEvents(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should load events written by emitEvent', async () => {
    await emitEvent(tmpDir, {
      skill: 'harness-execution',
      type: 'phase_transition',
      summary: 'PREPARE to EXECUTE',
    });
    await emitEvent(tmpDir, {
      skill: 'harness-execution',
      type: 'gate_result',
      summary: 'All checks passed',
      data: { passed: true, checks: [{ name: 'test', passed: true }] },
    });

    const result = await loadEvents(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value[0]!.type).toBe('phase_transition');
      expect(result.value[1]!.type).toBe('gate_result');
    }
  });

  it('should skip malformed lines gracefully', async () => {
    const eventsDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(eventsDir, { recursive: true });
    const eventsPath = path.join(eventsDir, 'events.jsonl');

    // Write a valid line, a corrupt line, and another valid line
    const validEvent = JSON.stringify({
      timestamp: '2026-03-30T10:00:00Z',
      skill: 'harness-execution',
      type: 'decision',
      summary: 'Valid event',
      contentHash: 'abc123',
    });
    fs.writeFileSync(
      eventsPath,
      `${validEvent}\nthis is not json\n${validEvent.replace('Valid event', 'Another event').replace('abc123', 'def456')}\n`
    );

    const result = await loadEvents(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });
});

describe('formatEventTimeline', () => {
  it('should return empty string for empty array', () => {
    expect(formatEventTimeline([])).toBe('');
  });

  it('should format phase_transition events', () => {
    const events: SkillEvent[] = [
      {
        timestamp: '2026-03-30T10:30:00Z',
        skill: 'harness-execution',
        type: 'phase_transition',
        summary: 'Moved to EXECUTE',
        data: { from: 'PREPARE', to: 'EXECUTE', taskCount: 12 },
      },
    ];
    const timeline = formatEventTimeline(events);
    expect(timeline).toContain('[harness-execution]');
    expect(timeline).toContain('phase: PREPARE -> EXECUTE (12 tasks)');
  });

  it('should format gate_result events', () => {
    const events: SkillEvent[] = [
      {
        timestamp: '2026-03-30T10:45:00Z',
        skill: 'harness-execution',
        type: 'gate_result',
        summary: 'Gate check completed',
        data: {
          passed: true,
          checks: [
            { name: 'test', passed: true },
            { name: 'lint', passed: false },
          ],
        },
      },
    ];
    const timeline = formatEventTimeline(events);
    expect(timeline).toContain('gate: passed (test Y, lint N)');
  });

  it('should format decision events', () => {
    const events: SkillEvent[] = [
      {
        timestamp: '2026-03-30T11:02:00Z',
        skill: 'harness-execution',
        type: 'decision',
        summary: 'Use polling over WebSocket',
      },
    ];
    const timeline = formatEventTimeline(events);
    expect(timeline).toContain('decision: Use polling over WebSocket');
  });

  it('should format handoff events', () => {
    const events: SkillEvent[] = [
      {
        timestamp: '2026-03-30T12:00:00Z',
        skill: 'harness-brainstorming',
        type: 'handoff',
        summary: 'Brainstorming complete',
        data: { fromSkill: 'harness-brainstorming', toSkill: 'harness-planning' },
      },
    ];
    const timeline = formatEventTimeline(events);
    expect(timeline).toContain('handoff: Brainstorming complete -> harness-planning');
  });

  it('should respect limit parameter', () => {
    const events: SkillEvent[] = Array.from({ length: 30 }, (_, i) => ({
      timestamp: `2026-03-30T${String(i).padStart(2, '0')}:00:00Z`,
      skill: 'harness-execution',
      type: 'checkpoint' as const,
      summary: `Checkpoint ${i}`,
    }));

    const timeline = formatEventTimeline(events, 5);
    const lines = timeline.split('\n');
    expect(lines.length).toBe(5);
    // Should show the LAST 5 events (25-29)
    expect(timeline).toContain('Checkpoint 25');
    expect(timeline).toContain('Checkpoint 29');
    expect(timeline).not.toContain('Checkpoint 24');
  });

  it('should default limit to 20', () => {
    const events: SkillEvent[] = Array.from({ length: 30 }, (_, i) => ({
      timestamp: `2026-03-30T10:${String(i).padStart(2, '0')}:00Z`,
      skill: 'harness-execution',
      type: 'checkpoint' as const,
      summary: `Checkpoint ${i}`,
    }));

    const timeline = formatEventTimeline(events);
    const lines = timeline.split('\n');
    expect(lines.length).toBe(20);
  });
});
