import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectTrigger } from '../../src/persona/trigger-detector';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trigger-detector-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectTrigger', () => {
  it('returns manual when no handoff.json exists', () => {
    const result = detectTrigger(tmpDir);
    expect(result.trigger).toBe('manual');
    expect(result.handoff).toBeUndefined();
  });

  it('returns on_plan_approved when planning handoff has pending tasks', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'handoff.json'),
      JSON.stringify({
        fromSkill: 'harness-planning',
        summary: 'Planned 3 tasks',
        pending: ['Task 1', 'Task 2', 'Task 3'],
        planPath: 'docs/plans/test-plan.md',
      })
    );

    const result = detectTrigger(tmpDir);
    expect(result.trigger).toBe('on_plan_approved');
    expect(result.handoff).toBeDefined();
    expect(result.handoff!.fromSkill).toBe('harness-planning');
    expect(result.handoff!.pending).toEqual(['Task 1', 'Task 2', 'Task 3']);
    expect(result.handoff!.planPath).toBe('docs/plans/test-plan.md');
    expect(result.handoff!.summary).toBe('Planned 3 tasks');
  });

  it('returns manual when handoff is from a different skill', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'handoff.json'),
      JSON.stringify({
        fromSkill: 'harness-execution',
        summary: 'Completed tasks',
        pending: [],
      })
    );

    const result = detectTrigger(tmpDir);
    expect(result.trigger).toBe('manual');
  });

  it('returns manual when pending array is empty', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'handoff.json'),
      JSON.stringify({
        fromSkill: 'harness-planning',
        summary: 'All done',
        pending: [],
      })
    );

    const result = detectTrigger(tmpDir);
    expect(result.trigger).toBe('manual');
  });

  it('returns manual when handoff.json is malformed', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(path.join(harnessDir, 'handoff.json'), 'not json');

    const result = detectTrigger(tmpDir);
    expect(result.trigger).toBe('manual');
  });

  it('handles missing summary gracefully', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'handoff.json'),
      JSON.stringify({
        fromSkill: 'harness-planning',
        pending: ['Task 1'],
      })
    );

    const result = detectTrigger(tmpDir);
    expect(result.trigger).toBe('on_plan_approved');
    expect(result.handoff!.summary).toBe('');
  });
});
