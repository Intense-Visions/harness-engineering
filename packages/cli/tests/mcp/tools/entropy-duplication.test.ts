// packages/cli/tests/mcp/tools/entropy-duplication.test.ts
//
// `detect_entropy type: "duplication"` through the REAL loader, the REAL
// EntropyAnalyzer and the REAL clone detector against a copied fixture — the
// `entropy-config-threading.test.ts` pattern, no mocks. The enum row is
// deliberately shallow; the behavioral rows below are the WIRED proof.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleDetectEntropy, detectEntropyDefinition } from '../../../src/mcp/tools/entropy';

const FIXTURE = path.join(__dirname, '../../fixtures/duplication-cli-project');

let projectDir: string;

function writeEntropy(entropy: Record<string, unknown>): void {
  const configPath = path.join(projectDir, 'harness.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  config.entropy = { ...config.entropy, ...entropy };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function detect(input: Parameters<typeof handleDetectEntropy>[0]) {
  const result = await handleDetectEntropy(input);
  return { result, payload: JSON.parse(result.content[0]!.text) };
}

describe('detect_entropy type: "duplication"', () => {
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dup-mcp-'));
    fs.cpSync(FIXTURE, projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('advertises duplication in the type enum', () => {
    // MUTATION: remove the enum value and this fails. Shallow on purpose.
    expect(detectEntropyDefinition.inputSchema.properties.type.enum).toContain('duplication');
  });

  it('reports the fixture clone class — the MCP WIRED proof', async () => {
    const { result, payload } = await detect({ path: projectDir, type: 'duplication' });
    expect(result.isError).toBeUndefined();
    expect(payload.duplication.classes).toHaveLength(1);
    expect(payload.duplication.classes[0].members).toHaveLength(3);
    expect(payload.duplication.classes[0].tokenCount).toBe(83);
    expect(payload.duplication.stats.classesReported).toBe(1);
  });

  it('threads an entropy.duplication override into the detector', async () => {
    // MUTATION: drop the `duplication` spread from the analyzer config and the
    // override stops biting — the class comes back.
    writeEntropy({ duplication: { minInstances: 4 } });
    const { result, payload } = await detect({ path: projectDir, type: 'duplication' });
    expect(result.isError).toBeUndefined();
    expect(payload.duplication.classes).toHaveLength(0);
    expect(payload.duplication.stats.classesSuppressed).toBeGreaterThanOrEqual(1);
  });

  it('does not run duplication under type: "all" on an unconfigured project', async () => {
    const { payload } = await detect({ path: projectDir, type: 'all' });
    expect('duplication' in payload).toBe(false);
  });

  it('refuses an explicit request when entropy.duplication is false', async () => {
    writeEntropy({ duplication: false });
    const result = await handleDetectEntropy({ path: projectDir, type: 'duplication' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('entropy.duplication');
  });

  it('omits byMember instead of shipping an unreadable {}', async () => {
    const { payload } = await detect({ path: projectDir, type: 'duplication' });
    // Measured BEFORE this change: duplication's keys were
    // ['classes','byMember','collisions','skipErrors','stats'] and
    // `byMember` serialized to `{}` — a key that reads as an empty index
    // rather than an unserializable Map (spec Phase 3 forward note 4).
    // MUTATION: return the raw report and `byMember` reappears.
    expect('byMember' in payload.duplication).toBe(false);
    expect(payload.duplication.classes[0].members).toHaveLength(3);
    // Nothing else was lost by the projection.
    expect(payload.duplication.stats.classesReported).toBe(1);
    expect(payload.duplication.collisions).toEqual([]);
    expect(payload.duplication.skipErrors).toEqual([]);
    expect(payload.snapshot).toBeDefined();
  });

  it('reports duplication in summary mode OUTSIDE totalIssues', async () => {
    const { payload } = await detect({ path: projectDir, type: 'duplication', mode: 'summary' });
    expect(payload.advisory.duplication.classesReported).toBe(1);
    expect(payload.advisory.duplication.membersReported).toBe(3);
    expect(payload.advisory.duplication.topClasses[0]).toContain('3x 83 tokens');
    // MUTATION: fold duplication into `totalIssues` and this fails — the D4
    // parity test for the MCP surface. `totalIssues` is the one number an
    // agent reads as "is this clean".
    expect(payload.totalIssues).toBe(0);
  });

  it('omits the advisory block in summary mode when duplication did not run', async () => {
    const { payload } = await detect({ path: projectDir, type: 'dead-code', mode: 'summary' });
    expect(payload.advisory).toBeUndefined();
  });

  it('still refuses patterns with no rules configured (no regression)', async () => {
    const result = await handleDetectEntropy({ path: projectDir, type: 'patterns' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('No pattern rules are configured');
  });
});
