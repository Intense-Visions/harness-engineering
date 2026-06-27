import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getStateResource } from '../../../src/mcp/resources/state';

describe('state resource', () => {
  it('returns valid JSON for nonexistent project', async () => {
    const result = await getStateResource('/nonexistent/path');
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('schemaVersion');
  });

  it('returns the default empty-state JSON when there is nothing to read', async () => {
    const result = await getStateResource('/nonexistent/path');
    const parsed = JSON.parse(result);
    // Fallback branch parity: same empty-state shape the legacy path emitted.
    expect(parsed).toEqual({
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
    });
  });

  it('serializes populated legacy state via the snapshot projection (R3 parity)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-resource-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
      const legacy = {
        schemaVersion: 1,
        position: { phase: 'execute', task: 'Task 14' },
        decisions: [
          { date: '2026-06-27', decision: 'resource reads', context: 'harness-execution' },
        ],
        blockers: [],
        progress: { 'Task 13': 'complete' },
      };
      fs.writeFileSync(path.join(tmpDir, '.harness', 'state.json'), JSON.stringify(legacy));

      const result = await getStateResource(tmpDir);
      const parsed = JSON.parse(result);
      // Parity: same stringified HarnessState the legacy loadState path produced (post migrate).
      expect(parsed).toEqual(legacy);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
