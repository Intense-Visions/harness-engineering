import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { emitSkillEvent, SKILL_EVENTS_FILE } from '../../../src/mcp/tools/skill-telemetry';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-telemetry-'));
  tmpDirs.push(d);
  return d;
}

describe('skill-telemetry (relocated off events.jsonl — #580 D5)', () => {
  it('writes to .harness/metrics/skill-events.jsonl, not .harness/events.jsonl', () => {
    expect(SKILL_EVENTS_FILE).toContain('metrics');
    expect(SKILL_EVENTS_FILE).toContain('skill-events.jsonl');
    expect(SKILL_EVENTS_FILE).not.toBe('events.jsonl');
  });

  it('appends one JSONL line per event with skill/type/timestamp fields', async () => {
    const dir = tmp();
    await emitSkillEvent(dir, {
      skill: 'harness-execution',
      type: 'phase_transition',
      summary: 'PREPARE -> EXECUTE',
      data: { from: 'PREPARE', to: 'EXECUTE' },
    });
    const filePath = path.join(dir, '.harness', 'metrics', 'skill-events.jsonl');
    expect(fs.existsSync(filePath)).toBe(true);
    const lines = fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim());
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]);
    expect(rec.skill).toBe('harness-execution');
    expect(rec.type).toBe('phase_transition');
    expect(typeof rec.timestamp).toBe('string');

    // The legacy events.jsonl must never be created.
    expect(fs.existsSync(path.join(dir, '.harness', 'events.jsonl'))).toBe(false);
  });

  it('appends successive events (no born-dedup needed for the cursor-based reader)', async () => {
    const dir = tmp();
    await emitSkillEvent(dir, { skill: 's', type: 'handoff', summary: 'a' });
    await emitSkillEvent(dir, { skill: 's', type: 'handoff', summary: 'b' });
    const filePath = path.join(dir, '.harness', 'metrics', 'skill-events.jsonl');
    const lines = fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((l) => l.trim());
    expect(lines).toHaveLength(2);
  });

  it('never throws on an unwritable path', async () => {
    await expect(
      emitSkillEvent('/nonexistent\0bad', { skill: 's', type: 'error', summary: 'x' })
    ).resolves.toBeUndefined();
  });
});
