import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleDetectEntropy } from '../../../src/mcp/tools/entropy';

// Integration regression for issue #723 defect #1: detect_entropy (and the
// assess_project path that calls it) must thread the project's `entropy.drift`
// config into the analyzer instead of always running DEFAULT_DRIFT_CONFIG.
// This exercises the REAL config loader + analyzer + drift detector (no mocks)
// against a small Python fixture whose docs reference a removed symbol.
const fixture = path.join(__dirname, '../../fixtures/entropy-drift-config');

let projectDir: string;

function writeConfig(config: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(projectDir, 'harness.config.json'),
    JSON.stringify({ version: 1, rootDir: '.', ...config }, null, 2)
  );
}

async function apiSignatureDriftCount(): Promise<number> {
  const result = await handleDetectEntropy({ path: projectDir, type: 'drift' });
  expect(result.isError).toBeUndefined();
  const data = JSON.parse(result.content[0].text);
  const drifts: Array<{ type: string }> = data.drift?.drifts ?? [];
  return drifts.filter((d) => d.type === 'api-signature').length;
}

describe('detect_entropy — honors entropy.drift config (issue #723)', () => {
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-drift-'));
    fs.cpSync(fixture, projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('reports api-signature drift for a removed symbol by default', async () => {
    writeConfig({});
    expect(await apiSignatureDriftCount()).toBeGreaterThan(0);
  });

  it('suppresses api-signature drift when checkApiSignatures is disabled', async () => {
    writeConfig({ entropy: { drift: { checkApiSignatures: false } } });
    expect(await apiSignatureDriftCount()).toBe(0);
  });

  it('suppresses a reference matched by ignorePatterns', async () => {
    writeConfig({ entropy: { drift: { ignorePatterns: ['^removed_symbol$'] } } });
    expect(await apiSignatureDriftCount()).toBe(0);
  });
});
