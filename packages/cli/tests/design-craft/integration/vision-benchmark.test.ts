// packages/cli/tests/design-craft/integration/vision-benchmark.test.ts
//
// Tests for the deep (vision) BENCHMARK path — the change that lets the
// exemplar-relative award bar actually clear. Code-only BENCHMARK scores
// source text, so innovation / coherence / surface land sub-floor or at low
// confidence and the verdict is never `cleared`; the vision path judges the
// rendered screenshot and can certify award tier.
//
// Coverage:
//   1. runVisionBenchmark scores through the provider's vision channel and,
//      given a strong rendered result, produces a `cleared` award verdict.
//   2. A weak / low-confidence rendered result does NOT clear.
//   3. MCP handler wires deep-mode benchmark to the vision path when captures
//      are supplied.
//   4. MCP handler errors when a benchmark target has no matching capture in
//      deep mode (a page-scoped verdict must never come from source alone).

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runVisionBenchmark } from '../../../src/design-craft/phases/benchmark.js';
import type { VisionBenchmarkTarget } from '../../../src/design-craft/phases/benchmark.js';
import { sonDavenMarketingPageExemplar } from '../../../src/design-craft/catalog/exemplars/son-daven-marketing-page.js';
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js';
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft.js';

/** Radar response builder. Defaults to a strong, high-confidence result. */
function radarResponse(score = 97, confidence: 'high' | 'medium' | 'low' = 'high'): string {
  const dim = (notes: string) => ({ score, confidence, notes });
  return [
    '```json',
    JSON.stringify(
      {
        philosophicalCoherence: dim('One clear thesis carried across every band.'),
        hierarchy: dim('Deliberate scale contrast; a single focal action.'),
        craftExecution: dim('Tuned type, committed surface, no template tells.'),
        function: dim('Resolves the page job cleanly.'),
        innovation: dim('A signature moment that reads as this brand only.'),
        gaps: [],
      },
      null,
      2
    ),
    '```',
  ].join('\n');
}

/** A MockLlmProvider that answers vision calls (the base mock throws on callVision). */
class VisionMockProvider extends MockLlmProvider {
  constructor(private readonly visionResponse: string) {
    super();
  }
  async callVision(): Promise<string> {
    this.recordCost({
      provider: this.providerId,
      model: this.model,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
    });
    return this.visionResponse;
  }
}

function writePng(dir: string, name: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic
  return p;
}

describe('runVisionBenchmark', () => {
  it('scores a rendered page through the vision channel and can clear the award bar', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-vision-bench-'));
    const image = writePng(tmpDir, 'landing.png');
    const target: VisionBenchmarkTarget = {
      file: 'landing.html',
      component: 'LandingPage',
      componentType: 'MarketingPage',
      image,
    };

    const scores = await runVisionBenchmark({
      targets: [target],
      exemplars: [sonDavenMarketingPageExemplar],
      provider: new VisionMockProvider(radarResponse(97, 'high')),
    });

    expect(scores).toHaveLength(1);
    expect(scores[0]!.exemplars).toEqual([sonDavenMarketingPageExemplar.id]);
    expect(scores[0]!.awardBar.verdict).toBe('cleared');
    expect(scores[0]!.awardBar.shortfalls).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not clear when the rendered result is weak or low-confidence', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-vision-bench-'));
    const image = writePng(tmpDir, 'landing.png');

    const scores = await runVisionBenchmark({
      targets: [
        { file: 'landing.html', component: 'LandingPage', componentType: 'MarketingPage', image },
      ],
      exemplars: [sonDavenMarketingPageExemplar],
      provider: new VisionMockProvider(radarResponse(60, 'low')),
    });

    expect(scores).toHaveLength(1);
    expect(scores[0]!.awardBar.verdict).not.toBe('cleared');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('design-craft MCP handler — deep-mode benchmark', () => {
  it('routes deep-mode benchmark through the vision channel when captures are supplied', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-vision-bench-'));
    const image = writePng(tmpDir, 'Landing.png');

    const result = await handleDesignCraft({
      path: tmpDir,
      mode: 'deep',
      phases: ['benchmark'],
      benchmarkTargets: [
        { file: 'src/Landing.tsx', component: 'Landing', componentType: 'MarketingPage' },
      ],
      captures: [{ file: 'src/Landing.tsx', component: 'Landing', image }],
      __testProvider: new VisionMockProvider(radarResponse(97, 'high')),
      __recordMeasurement: false,
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      scores: Array<{ awardBar: { verdict: string }; exemplars: string[] }>;
      summary: { mode: string };
    };
    expect(payload.summary.mode).toBe('deep');
    expect(payload.scores).toHaveLength(1);
    expect(payload.scores[0]!.awardBar.verdict).toBe('cleared');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('errors when a deep-mode benchmark target has no matching capture', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-vision-bench-'));

    const result = await handleDesignCraft({
      path: tmpDir,
      mode: 'deep',
      phases: ['benchmark'],
      benchmarkTargets: [
        { file: 'src/Landing.tsx', component: 'Landing', componentType: 'MarketingPage' },
      ],
      captures: [{ file: 'src/Other.tsx', component: 'Other', image: writePng(tmpDir, 'o.png') }],
      __testProvider: new VisionMockProvider(radarResponse()),
      __recordMeasurement: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/deep mode benchmarks rendered screenshots/i);
    expect(result.content[0].text).toMatch(/src\/Landing\.tsx/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
