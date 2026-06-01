// packages/cli/tests/design-craft/integration/benchmark-phase.test.ts
//
// Phase 2 integration tests for the design-craft BENCHMARK phase.
//
// Coverage:
//   1. Happy path — MockLlmProvider returns a complete 5-dim radar
//      response; runBenchmark produces a BenchmarkScore with all five
//      dimensions populated, overall computed (mean score + min
//      confidence), and gaps surfaced.
//   2. ComponentType filter — when target.componentType does not match any
//      exemplar, the target is silently skipped.
//   3. Overall confidence rule — when any one dimension reports
//      confidence: 'low', the overall confidence is 'low' (ADR 0019).
//   4. End-to-end via MCP handler — phase selector wires BENCHMARK
//      correctly through benchmarkTargets.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runBenchmark } from '../../../src/design-craft/phases/benchmark.js';
import type { BenchmarkTarget } from '../../../src/design-craft/phases/benchmark.js';
import { linearEmptyListExemplar } from '../../../src/design-craft/catalog/exemplars/linear-empty-list.js';
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js';
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft.js';

const EMPTY_STATE_SOURCE = `
export function EmptyInbox() {
  return (
    <div>
      <h2>Inbox zero</h2>
      <p>You're all caught up.</p>
      <button>Compose</button>
    </div>
  );
}
`;

function buildRadarResponse(opts?: {
  philosophicalCoherenceConfidence?: 'high' | 'medium' | 'low';
}): string {
  return [
    '```json',
    JSON.stringify(
      {
        philosophicalCoherence: {
          score: 80,
          confidence: opts?.philosophicalCoherenceConfidence ?? 'medium',
          notes: 'Voice is coherent but lacks the studied calm of the exemplar.',
        },
        hierarchy: {
          score: 85,
          confidence: 'high',
          notes: 'Verb-led heading + single CTA; close to the exemplar.',
        },
        craftExecution: {
          score: 70,
          confidence: 'medium',
          notes: 'Typography lacks the leading and tracking work of the exemplar.',
        },
        function: {
          score: 90,
          confidence: 'high',
          notes: 'Fit-for-purpose; resolves the empty case clearly.',
        },
        innovation: {
          score: 60,
          confidence: 'medium',
          notes: 'Conventional shape; no signature move.',
        },
        gaps: ['No subtle illustration / visual accent', 'Default leading; not tuned per role'],
      },
      null,
      2
    ),
    '```',
  ].join('\n');
}

describe('design-craft BENCHMARK phase', () => {
  const target: BenchmarkTarget = {
    file: 'fixtures/EmptyInbox.tsx',
    component: 'EmptyInbox',
    source: EMPTY_STATE_SOURCE,
    componentType: 'EmptyState',
  };

  it('produces a 5-dim radar score with overall computed from the dims', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'EmptyInbox', response: buildRadarResponse() },
    ]);

    const scores = await runBenchmark({
      targets: [target],
      exemplars: [linearEmptyListExemplar],
      provider,
    });

    expect(scores).toHaveLength(1);
    const [score] = scores;
    expect(score.target).toEqual({
      file: 'fixtures/EmptyInbox.tsx',
      component: 'EmptyInbox',
    });
    expect(score.exemplars).toEqual(['exemplar-linear-empty-list']);
    expect(score.radar.philosophicalCoherence.score).toBe(80);
    expect(score.radar.hierarchy.score).toBe(85);
    expect(score.radar.craftExecution.score).toBe(70);
    expect(score.radar.function.score).toBe(90);
    expect(score.radar.innovation.score).toBe(60);
    // Mean of 80/85/70/90/60 = 77
    expect(score.overall.score).toBe(77);
    // Min confidence of medium/high/medium/high/medium = medium
    expect(score.overall.confidence).toBe('medium');
    expect(score.gaps).toHaveLength(2);
    expect(score.gaps[0]).toContain('illustration');
  });

  it('drops to overall confidence "low" when any dimension is low (ADR 0019)', async () => {
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'EmptyInbox',
        response: buildRadarResponse({ philosophicalCoherenceConfidence: 'low' }),
      },
    ]);

    const [score] = await runBenchmark({
      targets: [target],
      exemplars: [linearEmptyListExemplar],
      provider,
    });

    expect(score.overall.confidence).toBe('low');
  });

  it('skips targets whose componentType does not match any exemplar', async () => {
    const provider = new MockLlmProvider();
    const wrongTypeTarget: BenchmarkTarget = {
      file: 'fixtures/MyButton.tsx',
      component: 'MyButton',
      source: '<button>Go</button>',
      componentType: 'Button',
    };

    const scores = await runBenchmark({
      targets: [wrongTypeTarget],
      exemplars: [linearEmptyListExemplar],
      provider,
    });

    expect(scores).toEqual([]);
  });
});

describe('design-craft MCP handler — BENCHMARK phase wiring', () => {
  it('runs BENCHMARK end-to-end via benchmarkTargets', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-benchmark-'));
    const fixturePath = path.join(tmpDir, 'EmptyInbox.tsx');
    fs.writeFileSync(fixturePath, EMPTY_STATE_SOURCE, 'utf8');

    const provider = new MockLlmProvider([
      { promptIncludes: 'EmptyInbox', response: buildRadarResponse() },
    ]);

    const result = await handleDesignCraft({
      path: tmpDir,
      mode: 'fast',
      phases: ['benchmark'],
      autoCapture: 'skip',
      benchmarkTargets: [
        {
          file: fixturePath,
          component: 'EmptyInbox',
          componentType: 'EmptyState',
        },
      ],
      __testProvider: provider,
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      scores: Array<{
        target: { component: string };
        exemplars: string[];
        overall: { score: number; confidence: string };
      }>;
      summary: {
        phaseRun: string[];
        catalog: { exemplarsCited: string[] };
      };
    };

    expect(payload.scores).toHaveLength(1);
    expect(payload.scores[0].target.component).toBe('EmptyInbox');
    // EmptyState targets now match TWO seed exemplars (Linear's resolved
    // register CRAFT-B001 + Notion's instructional register CRAFT-B007).
    // The MCP handler forwards every matching exemplar so BENCHMARK can
    // score against both registers in a single pass; cited exemplars are
    // returned in seed-array order.
    expect(payload.scores[0].exemplars).toEqual([
      'exemplar-linear-empty-list',
      'exemplar-notion-empty-database',
    ]);
    expect(payload.scores[0].overall.score).toBe(77);
    expect(payload.summary.phaseRun).toEqual(['benchmark']);
    expect(payload.summary.catalog.exemplarsCited).toEqual([
      'exemplar-linear-empty-list',
      'exemplar-notion-empty-database',
    ]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
