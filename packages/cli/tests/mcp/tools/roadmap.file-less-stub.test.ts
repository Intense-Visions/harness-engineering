import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';

describe('manage_roadmap — Phase 3 file-less stub', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-stub-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('throws with the expected stub message in file-less mode', async () => {
    fs.writeFileSync(
      path.join(dir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        roadmap: {
          mode: 'file-less',
          tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
        },
      })
    );
    await expect(handleManageRoadmap({ path: dir, action: 'show' })).rejects.toThrow(
      /file-less roadmap mode is not yet wired in manage_roadmap MCP tool; see Phase 4\./
    );
  });

  it('falls through to file-backed path when mode is absent (no throw)', async () => {
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 1 }));
    // file-backed path will return roadmapNotFoundError because docs/roadmap.md is absent;
    // the important assertion is that NO stub error is thrown.
    const res = await handleManageRoadmap({ path: dir, action: 'show' });
    expect(res.isError).toBe(true);
    const text = res.content?.[0]?.text ?? '';
    expect(text).toMatch(/docs\/roadmap\.md not found/);
    expect(text).not.toMatch(/not yet wired/);
  });
});
