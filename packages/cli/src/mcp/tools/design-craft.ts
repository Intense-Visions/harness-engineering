// packages/cli/src/mcp/tools/design-craft.ts
//
// MCP tool `mcp__harness__design_craft` — entry point for the
// harness-design-craft skill (sub-project #6 of the design-pipeline
// initiative).
//
// MVP scope (this commit):
//   - Definition + handler exported in the conventional shape used by all
//     other tools in this directory (validate.ts, skill.ts, etc.). The
//     handler is NOT yet wired into mcp/server.ts — that registration is
//     called out as a separate coordination commit by the user's scope
//     statement, mirroring the same posture the user took for
//     harness.config.json schema extension and DesignConstraintAdapter.
//   - CRITIQUE phase invoked end-to-end against the one seeded rubric
//     (hierarchy-clarity). POLISH and BENCHMARK are stubs returning [].
//   - Mode arg accepts 'fast' | 'deep' but only 'fast' is implemented;
//     'deep' returns a friendly "unimplemented in MVP" error.
//   - autoCapture arg accepts 'prompt' | 'auto' | 'skip' but only 'skip'
//     has fully defined behavior in this MVP (no detect-and-offer yet);
//     'prompt' and 'auto' are accepted and currently behave like 'skip'
//     with a TODO marker.
//
// Honors:
//   - ADR 0018: phase selection respected; cost surfaced in summary.
//   - ADR 0019: findings carry the 3-axis trio as emitted by the LLM.
//   - ADR 0020: catalog provenance recorded in summary.catalog.
//   - ADR 0021 (detect-and-offer): structurally honored by the
//     autoCapture arg surface; offer payload is not yet constructed.
//
// Spec ref: docs/changes/design-pipeline/design-craft-elevator/proposal.md
//   section "MCP tool API" (lines ~205–221).

import * as crypto from 'node:crypto';
import { Ok, Err } from '@harness-engineering/core';
import type { Result } from '@harness-engineering/core';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import type { McpToolResponse } from '../utils/result-adapter.js';
import { runCritique } from '../../design-craft/phases/critique.js';
import type { CritiqueTarget } from '../../design-craft/phases/critique.js';
import { hierarchyClarityRubric } from '../../design-craft/catalog/rubrics/hierarchy-clarity.js';
import { getProvider } from '../../design-craft/llm/provider.js';
import type { LlmProvider } from '../../design-craft/llm/provider.js';
import type {
  CraftFinding,
  BenchmarkScore,
  DesignCraftOutput,
} from '../../design-craft/findings/schema.js';

type Phase = 'critique' | 'polish' | 'benchmark';
type Mode = 'fast' | 'deep';
type AutoCapture = 'prompt' | 'auto' | 'skip';

export interface DesignCraftInput {
  path: string;
  mode?: Mode;
  phases?: Phase[];
  files?: string[];
  autoCapture?: AutoCapture;
  designStrictness?: 'strict' | 'standard' | 'permissive';
  catalog?: {
    rubrics?: string[];
    patterns?: string[];
    exemplars?: string[];
  };
  /**
   * Test seam — inject an LlmProvider directly (e.g. MockLlmProvider).
   * NOT documented in the MCP tool schema; used by integration tests so
   * deterministic CI works without touching the live provider factory.
   */
  __testProvider?: LlmProvider;
}

const DEFAULT_PHASES: readonly Phase[] = ['critique', 'polish', 'benchmark'];

export const designCraftToolDefinition = {
  name: 'design_craft',
  description:
    "Run the harness-design-craft skill: CRITIQUE / POLISH / BENCHMARK phases over a project's components. Phase 1 MVP: fast-mode CRITIQUE with the seeded hierarchy-clarity rubric; POLISH and BENCHMARK are stubs.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      mode: {
        type: 'string',
        enum: ['fast', 'deep'],
        description:
          'fast (code-only LLM critique) or deep (render + vision). MVP supports fast only.',
      },
      phases: {
        type: 'array',
        items: { type: 'string', enum: ['critique', 'polish', 'benchmark'] },
        description: 'Subset of phases to run. Defaults to all three.',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional file scoping. Each entry is a path relative to project root.',
      },
      autoCapture: {
        type: 'string',
        enum: ['prompt', 'auto', 'skip'],
        description:
          'B\' detect-and-offer behavior when preconditions are missing. MVP: only "skip" is fully implemented.',
      },
      designStrictness: {
        type: 'string',
        enum: ['strict', 'standard', 'permissive'],
        description: 'Overall design strictness (passed through to harness-design when chained).',
      },
    },
    required: ['path'],
  },
};

function selectPhases(requested?: Phase[]): Phase[] {
  if (!requested || requested.length === 0) return [...DEFAULT_PHASES];
  const unique = Array.from(new Set(requested));
  return unique.filter((p): p is Phase => (DEFAULT_PHASES as readonly string[]).includes(p));
}

function buildTargetsFromFiles(files: string[] | undefined): CritiqueTarget[] {
  if (!files || files.length === 0) return [];
  return files.map((file) => ({ file }));
}

/**
 * Aggregate llmCalls summary from the provider. Mock provider tracks
 * its own cost ledger; real providers will surface this through their own
 * cost adapter.
 */
function summarizeLlmCalls(provider: LlmProvider): DesignCraftOutput['summary']['llmCalls'] {
  const maybeGetCosts = (provider as unknown as { getCosts?: () => Array<{ costUsd: number }> })
    .getCosts;
  const costs = typeof maybeGetCosts === 'function' ? maybeGetCosts.call(provider) : [];
  const costUsd = costs.reduce((sum, c) => sum + (c.costUsd ?? 0), 0);
  return {
    provider: provider.providerId,
    model: provider.model,
    count: costs.length,
    costUsd,
  };
}

async function runPipeline(
  input: DesignCraftInput
): Promise<Result<DesignCraftOutput, { message: string }>> {
  const mode: Mode = input.mode ?? 'fast';
  if (mode === 'deep') {
    return Err({
      message:
        'design-craft deep mode (render + vision LLM) is not implemented in the Phase 1 MVP. Use mode: "fast".',
    });
  }

  const phases = selectPhases(input.phases);
  const autoCapture: AutoCapture = input.autoCapture ?? 'prompt';
  if (autoCapture !== 'skip') {
    // TODO (next task): implement resolvers/preconditions + resolvers/offer
    // to populate `upgradeOffer`. For MVP we behave like 'skip' to avoid
    // emitting a half-finished detect-and-offer payload.
  }

  const provider = input.__testProvider ?? getProvider();
  const targets = buildTargetsFromFiles(input.files);

  const startedAt = Date.now();
  const findings: CraftFinding[] = [];
  const scores: BenchmarkScore[] = [];

  let rubricsApplied: string[] = [];
  if (phases.includes('critique') && targets.length > 0) {
    const rubrics = [hierarchyClarityRubric];
    rubricsApplied = rubrics.map((r) => r.id);
    const critiqueFindings = await runCritique({ targets, rubrics, provider });
    findings.push(...critiqueFindings);
  }

  // POLISH stub — Phase 2 work per spec Implementation Order.
  // BENCHMARK stub — Phase 2 work per spec Implementation Order.

  const output: DesignCraftOutput = {
    findings,
    scores,
    summary: {
      phaseRun: phases,
      mode,
      durationMs: Date.now() - startedAt,
      llmCalls: summarizeLlmCalls(provider),
      catalog: {
        rubricsApplied,
        patternsApplied: [],
        exemplarsCited: [],
      },
      preconditions: {
        // Real precondition probing lands with resolvers/preconditions.ts.
        // For MVP we report `false` so consumers don't mistakenly assume
        // intent-anchored critique ran.
        aestheticIntentDeclared: false,
        designMdExists: false,
        tokensExist: false,
      },
      deferralsToHarnessDesign: 0,
      runId: crypto.randomUUID(),
    },
  };

  return Ok(output);
}

export async function handleDesignCraft(input: DesignCraftInput): Promise<McpToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return resultToMcpResponse(Err({ message: 'design_craft: `path` is required' }));
  }
  try {
    const result = await runPipeline(input);
    return resultToMcpResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return resultToMcpResponse(Err({ message: `design_craft failed: ${message}` }));
  }
}
