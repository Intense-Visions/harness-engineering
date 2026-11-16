// packages/cli/tests/mcp/tools/entropy-duplication-baseline.test.ts
//
// Roadmap `duplication-baseline-ratchet` on the MCP surface: detect_entropy
// reports the advisory delta against `.harness/duplication/baseline.json`
// (compare-only; the CLI records it) and never sums it into totalIssues.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleDetectEntropy } from '../../../src/mcp/tools/entropy';
import { runCleanup } from '../../../src/commands/cleanup';

const FIXTURE = path.join(__dirname, '../../fixtures/duplication-cli-project');

let projectDir: string;

async function detect(mode: 'summary' | 'detailed') {
  const result = await handleDetectEntropy({ path: projectDir, type: 'duplication', mode });
  expect(result.isError).toBeUndefined();
  return JSON.parse(result.content[0]!.text);
}

describe('detect_entropy — duplication baseline delta', () => {
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dup-baseline-mcp-'));
    fs.cpSync(FIXTURE, projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('summary mode reports no-baseline when none was recorded', async () => {
    const payload = await detect('summary');
    expect(payload.advisory.duplication.baseline.status).toBe('no-baseline');
    expect(payload.totalIssues).toBe(0);
  });

  it('detailed mode reports the delta against a CLI-recorded baseline', async () => {
    const recorded = await runCleanup({
      configPath: path.join(projectDir, 'harness.config.json'),
      type: 'duplication',
      updateBaseline: true,
    });
    expect(recorded.ok).toBe(true);
    fs.rmSync(path.join(projectDir, 'src', 'gamma.ts'));
    const payload = await detect('detailed');
    expect(payload.duplicationBaseline).toMatchObject({
      status: 'compared',
      classDelta: -1,
      baselineClasses: 1,
      currentClasses: 0,
    });
  });
});
