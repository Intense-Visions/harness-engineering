/**
 * MCP tool: `mcp__harness__outcome_eval`.
 *
 * Post-execution spec-satisfaction judgment. Wraps the intelligence-package
 * `OutcomeEvaluator` so an agent can actually run the TS-derived-authority
 * seam (evaluate -> deriveAuthority) rather than emulating the verdict in
 * chat (ADR 0037).
 *
 * Provider resolution mirrors `summarize-session.ts`'s
 * `resolveAnthropicProvider`: a real `AnalysisProvider` (`.analyze<T>()`) is
 * required by `OutcomeEvaluator`, which calls the provider directly and has no
 * two-step in-session finalize flow. When no provider is configured the
 * evaluator degrades safely to INCONCLUSIVE/advisory — never blocking.
 *
 * GraphStore resolution mirrors the graph MCP tools (`loadGraphStore`); when no
 * graph exists an empty in-memory store is used so the Phase 4
 * execution_outcome write is a degrade-safe no-op.
 *
 * Source: docs/changes/outcome-eval/proposal.md (Surface area -> MCP tool).
 */

import * as path from 'node:path';
import { readGuardianAnalyses } from '@harness-engineering/intelligence';
import type { GuardianAnalysis } from '@harness-engineering/intelligence';
import { sanitizePath } from '../utils/sanitize-path.js';
import { loadGraphStore } from '../utils/graph-loader.js';
import { resolveAnalysisProvider } from '../utils/analysis-provider.js';
import { emitOutcomeVerdictEvent } from '../utils/waypoint-emission.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface OutcomeEvalToolInput {
  /** Absolute or repo-relative path to the spec markdown. Required. */
  specPath: string;
  /** Unified diff of the change under judgment. Required. */
  diff: string;
  /** Captured test-runner output. Required. */
  testOutput: string;
  /** Optional model override for the outcome-eval LLM call. */
  model?: string;
  /** Project root used to resolve the knowledge graph (default: cwd). */
  path?: string;
  /**
   * Optional head commit sha of the change under judgment. When supplied it is
   * persisted onto the `execution_outcome` node's metadata so a sha-keyed
   * consumer (e.g. the pre-merge brief) can look the verdict up. Additive:
   * omitting it leaves the persisted node byte-identical to prior behaviour.
   */
  commit?: string;
}

export const outcomeEvalDefinition = {
  name: 'outcome_eval',
  description:
    'Post-execution LLM-judgment: did the implementation actually satisfy its spec? ' +
    "Reads the spec's acceptance section, the change diff, and test output, and emits a " +
    'confidence-rated OutcomeVerdict (SATISFIED | NOT_SATISFIED | INCONCLUSIVE) with a ' +
    'rationale and unmetCriteria. Ship authority is DERIVED in TypeScript, never trusted ' +
    'from the LLM: a high-confidence NOT_SATISFIED is blocking; every other verdict is ' +
    "advisory. The harness's first blocking post-execution spec-satisfaction gate. " +
    'IMPORTANT: diff and testOutput are required — omitting them degrades the verdict to ' +
    'INCONCLUSIVE/advisory (never blocking), so the calling agent MUST supply them from the ' +
    'session (git diff + test-runner output). Each verdict persists as an execution_outcome node.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      specPath: {
        type: 'string',
        description: 'Absolute or repo-relative path to the spec markdown to judge against',
      },
      diff: {
        type: 'string',
        description:
          'Unified diff of the change under judgment (e.g. `git diff` / `git diff <base>...HEAD`). ' +
          'Required: an empty diff degrades the verdict to INCONCLUSIVE/advisory.',
      },
      testOutput: {
        type: 'string',
        description:
          'Captured test-runner stdout+stderr. Required: empty/unparseable output is tolerated but ' +
          'degrades the verdict toward INCONCLUSIVE/advisory.',
      },
      model: {
        type: 'string',
        description: 'Optional model override for the outcome-eval LLM call',
      },
      path: {
        type: 'string',
        description: 'Project root used to resolve the knowledge graph (default: cwd)',
      },
      commit: {
        type: 'string',
        description:
          'Optional head commit sha of the change under judgment. Persisted onto the ' +
          'execution_outcome node so a sha-keyed consumer (e.g. the pre-merge brief) can ' +
          'look the verdict up. Omitting it is safe (additive).',
      },
    },
    required: ['specPath', 'diff', 'testOutput'],
  },
};

// AnalysisProvider resolution (Anthropic key → cloud; HARNESS_ANALYSIS_BASE_URL
// → local /v1 judge; else null → degrade) lives in the shared helper so
// outcome_eval and acceptance_eval stay in lockstep. See utils/analysis-provider.

/** Build an empty in-memory GraphStore (degrade-safe persistence fallback). */
async function emptyGraphStore(): Promise<unknown> {
  const { GraphStore } = await import('@harness-engineering/graph');
  return new GraphStore();
}

/** Validate the required string inputs. Returns an error message or null. */
function validateInput(input: OutcomeEvalToolInput): string | null {
  if (typeof input?.specPath !== 'string' || input.specPath.length === 0) {
    return 'outcome_eval: `specPath` is required';
  }
  if (typeof input?.diff !== 'string') return 'outcome_eval: `diff` is required';
  if (typeof input?.testOutput !== 'string') return 'outcome_eval: `testOutput` is required';
  return null;
}

/**
 * Construct the evaluator. The provider may be null when no key is configured;
 * we pass a guaranteed-rejecting stub so the evaluator's degrade-safe judge()
 * produces INCONCLUSIVE/advisory and authority stays TS-derived.
 */
async function buildEvaluator(input: OutcomeEvalToolInput): Promise<{
  evaluate: (i: {
    specPath: string;
    diff: string;
    testOutput: string;
    guardian?: GuardianAnalysis[];
  }) => Promise<unknown>;
}> {
  const projectRoot = sanitizePath(input.path ?? process.cwd());
  const { OutcomeEvaluator } = await import('@harness-engineering/intelligence');
  const provider = await resolveAnalysisProvider(input.model);
  const store = (await loadGraphStore(projectRoot)) ?? (await emptyGraphStore());
  return new OutcomeEvaluator(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider ?? unconfiguredProvider()) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store as any,
    input.model !== undefined ? { model: input.model } : {}
  );
}

/**
 * Best-effort read of advisory guardian diff-coverage records from the
 * project's `.harness/analyses/` archive (#914). Degrade-safe: any failure (and
 * the common absent-archive case) yields `[]`, so the verdict stays
 * byte-identical to no guardian wiring.
 */
async function loadGuardian(input: OutcomeEvalToolInput): Promise<GuardianAnalysis[]> {
  try {
    const projectRoot = sanitizePath(input.path ?? process.cwd());
    return await readGuardianAnalyses(path.join(projectRoot, '.harness', 'analyses'));
  } catch {
    return [];
  }
}

export async function handleOutcomeEval(input: OutcomeEvalToolInput): Promise<ToolResponse> {
  const validationError = validateInput(input);
  if (validationError !== null) return errorResponse(validationError);

  try {
    const evaluator = await buildEvaluator(input);
    const guardian = await loadGuardian(input);
    const verdict = await evaluator.evaluate({
      specPath: input.specPath,
      diff: input.diff,
      testOutput: input.testOutput,
      ...(typeof input.commit === 'string' && input.commit !== '' ? { commit: input.commit } : {}),
      ...(guardian.length > 0 ? { guardian } : {}),
    });

    // Waypoint sdlc.* emission (opt-in): surfaces the persisted verdict as a
    // spooled sdlc.verify.graded.v1 event. No-op without a configured sink;
    // never affects the verdict or the response.
    await emitOutcomeVerdictEvent(
      sanitizePath(input.path ?? process.cwd()),
      verdict,
      input.specPath
    );

    // Return the verdict EXACTLY as the evaluator produced it — authority is
    // TS-derived (deriveAuthority); the handler never recomputes it.
    return { content: [{ type: 'text', text: JSON.stringify(verdict, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`outcome_eval failed: ${message}`);
  }
}

/**
 * A provider whose analyze() always rejects. Used only when no real provider is
 * configured: the evaluator's judge() catches the rejection and degrades to
 * INCONCLUSIVE/low/advisory, so the contract "missing provider => never blocks"
 * holds without special-casing in the handler.
 */
function unconfiguredProvider(): { analyze: () => Promise<never> } {
  return {
    analyze: () =>
      Promise.reject(
        new Error(
          'No analysis provider configured (set ANTHROPIC_API_KEY). ' +
            'Degrading to an inconclusive, advisory verdict.'
        )
      ),
  };
}

function errorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
