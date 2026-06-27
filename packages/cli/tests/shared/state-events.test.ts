import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readHarnessState, emitCoreEvent } from '../../src/shared/state-events';
import type { HarnessState } from '@harness-engineering/core';

let proj: string;
beforeEach(() => {
  proj = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-state-events-'));
});
afterEach(() => {
  fs.rmSync(proj, { recursive: true, force: true });
});

const LEGACY: HarnessState = {
  schemaVersion: 1,
  position: { phase: 'execute', task: 'Task 8' },
  decisions: [
    { date: '2026-06-25T00:00:00.000Z', decision: 'legacy decision', context: 'planning' },
  ],
  blockers: [{ id: 'b1', description: 'legacy blocker', status: 'open' }],
  progress: { 'Task 1': 'complete' },
};

function writeLegacy(state: HarnessState = LEGACY): void {
  const stateDir = path.join(proj, '.harness');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(state, null, 2));
}

describe('readHarnessState / emitCoreEvent facade', () => {
  it('(a) reads a HarnessState deep-equal to the legacy state.json (genesis-then-read)', async () => {
    writeLegacy();
    const result = await readHarnessState(proj);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(LEGACY);
  });

  it('(b) emitCoreEvent unions a new decision onto the imported legacy decisions (no legacy loss)', async () => {
    writeLegacy();
    // Import legacy first via a read, then append a new decision.
    await readHarnessState(proj);
    const emit = await emitCoreEvent(proj, {
      type: 'decision_recorded',
      payload: { id: 'new-1', text: 'fresh decision', context: 'harness-execution' },
    });
    expect(emit.ok).toBe(true);

    const after = await readHarnessState(proj);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const decisionTexts = after.value.decisions.map((d) => d.decision);
    expect(decisionTexts).toContain('legacy decision'); // legacy preserved
    expect(decisionTexts).toContain('fresh decision'); // new appended
    expect(after.value.decisions).toHaveLength(2);
    // The new decision carries the emitted context.
    const fresh = after.value.decisions.find((d) => d.decision === 'fresh decision');
    expect(fresh?.context).toBe('harness-execution');
  });

  it('(c) returns the Result shape callers expect (ok + value)', async () => {
    // No legacy file → empty default state, still a well-formed Result<HarnessState>.
    const result = await readHarnessState(proj);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.position).toEqual({});
    expect(result.value.decisions).toEqual([]);
    expect(result.value.blockers).toEqual([]);
    expect(result.value.progress).toEqual({});
  });
});
