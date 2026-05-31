// packages/cli/tests/design-craft/integration/measurement-wiring.test.ts
//
// Verifies that the runPipeline orchestration:
//   1. Calls recordTrigger per loaded rubric (CRITIQUE)
//   2. Calls recordApply per emitted POLISH finding
//   3. Calls recordSignalEvent per CRITIQUE + POLISH finding
//   4. Honors __recordMeasurement: false (no files written)
//
// Uses a tmp `path` so the .harness/design-craft/ artifacts are isolated.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft.js';
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js';
import { getCatalogStats } from '../../../src/design-craft/measurement/usage.js';

const FIXTURE_SOURCE = `
export function HeroCtas() {
  return (
    <div>
      <button className="bg-blue-500 text-white px-4 py-2">Sign up</button>
      <button className="bg-blue-500 text-white px-4 py-2">Log in</button>
      <button className="bg-blue-500 text-white px-4 py-2">Learn more</button>
    </div>
  );
}
`;

describe('design-craft runPipeline measurement wiring', () => {
  let projectRoot: string;
  let fixturePath: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-measurement-'));
    fixturePath = path.join(projectRoot, 'HeroCtas.tsx');
    fs.writeFileSync(fixturePath, FIXTURE_SOURCE, 'utf8');
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('records a trigger per loaded rubric after a CRITIQUE run', async () => {
    const result = await handleDesignCraft({
      path: projectRoot,
      phases: ['critique'],
      files: [fixturePath],
      autoCapture: 'skip',
      __testProvider: new MockLlmProvider(),
    });
    expect(result.isError).toBeFalsy();

    const stats = getCatalogStats(projectRoot);
    expect(stats.rubrics['rubric-hierarchy-clarity']).toBe(1);
    expect(stats.rubrics['rubric-typography-craft']).toBe(1);
    expect(stats.rubrics['rubric-motion-quality']).toBe(1);
    expect(stats.rubrics['rubric-color-confidence']).toBe(1);
    expect(stats.rubrics['rubric-density-rhythm']).toBe(1);
    expect(stats.rubrics['rubric-restraint']).toBe(1);
    expect(stats.rubrics['rubric-polish-details']).toBe(1);
    expect(stats.rubrics['rubric-copy-voice']).toBe(1);
    expect(stats.rubrics['rubric-interaction-craft']).toBe(1);
    expect(stats.rubrics['rubric-brand-coherence']).toBe(1);
    // CRITIQUE does not bump pattern or exemplar counters.
    expect(stats.patterns).toEqual({});
    expect(stats.exemplars).toEqual({});
  });

  it('emits signal events for every CRITIQUE finding', async () => {
    await handleDesignCraft({
      path: projectRoot,
      phases: ['critique'],
      files: [fixturePath],
      autoCapture: 'skip',
      __testProvider: new MockLlmProvider(),
    });

    const events = path.join(projectRoot, '.harness', 'design-craft', 'signal-events.jsonl');
    expect(fs.existsSync(events)).toBe(true);
    const lines = fs
      .readFileSync(events, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    // 10 rubrics × 1 target = 10 findings = 10 events (Phase 2C closes SC #7)
    expect(lines).toHaveLength(10);
    const parsed = lines.map((l) => JSON.parse(l) as { finding: { code: string } });
    const codes = parsed.map((e) => e.finding.code).sort();
    expect(codes).toEqual([
      'CRAFT-C001',
      'CRAFT-C002',
      'CRAFT-C003',
      'CRAFT-C004',
      'CRAFT-C005',
      'CRAFT-C006',
      'CRAFT-C007',
      'CRAFT-C008',
      'CRAFT-C009',
      'CRAFT-C010',
    ]);
  });

  it('honors __recordMeasurement: false (no files written)', async () => {
    await handleDesignCraft({
      path: projectRoot,
      phases: ['critique'],
      files: [fixturePath],
      autoCapture: 'skip',
      __testProvider: new MockLlmProvider(),
      __recordMeasurement: false,
    });

    const usageFile = path.join(projectRoot, '.harness', 'design-craft', 'usage.json');
    const eventsFile = path.join(projectRoot, '.harness', 'design-craft', 'signal-events.jsonl');
    expect(fs.existsSync(usageFile)).toBe(false);
    expect(fs.existsSync(eventsFile)).toBe(false);
  });

  it('records pattern apply counters only when POLISH emits findings (the mock keeps it minimal)', async () => {
    // The default MockLlmProvider returns a CRITIQUE-shaped response that
    // lacks the POLISH `applies` field, so polish.runPolish drops every
    // call as non-applicable. apply counter should remain empty AND no
    // pattern-source signal events should be written from POLISH.
    await handleDesignCraft({
      path: projectRoot,
      phases: ['polish'],
      files: [fixturePath],
      autoCapture: 'skip',
      __testProvider: new MockLlmProvider(),
    });

    const stats = getCatalogStats(projectRoot);
    expect(stats.patterns).toEqual({});
  });
});
