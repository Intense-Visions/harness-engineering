import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleInsightsSummary } from '../../../src/mcp/tools/insights-summary';

/**
 * A failed entropy analysis must reach the MCP caller as null blocks plus
 * warnings, not as zero counts and `health.passed: true` (#2267). The measured
 * twin (a dead file, health FAIL) shows the fixture discriminates.
 */
describe('insights_summary MCP tool', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'insights-mcp-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  async function report(): Promise<{
    health: { passed: boolean } | null;
    entropy: unknown;
    warnings: string[];
  }> {
    const res = await handleInsightsSummary({ path: tmp, skip: ['decay', 'attention', 'impact'] });
    expect(res.isError).toBeFalsy();
    return JSON.parse((res.content[0] as { text: string }).text);
  }

  it('reports health FAIL for a project with a dead file', async () => {
    mkdirSync(join(tmp, 'src'));
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'fx', main: 'src/index.ts' }));
    writeFileSync(join(tmp, 'src', 'index.ts'), 'export const main = 1;\n');
    writeFileSync(join(tmp, 'src', 'orphan.ts'), 'export const orphan = 2;\n');

    const r = await report();
    expect(r.warnings).toEqual([]);
    expect(r.health?.passed).toBe(false);
  });

  it('returns null health and entropy plus warnings when entropy analysis fails', async () => {
    const r = await report();
    expect(r.health).toBeNull();
    expect(r.entropy).toBeNull();
    expect(r.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/^health: entropy analysis failed/)])
    );
  });
});
