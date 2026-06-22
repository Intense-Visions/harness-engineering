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

import { sanitizePath } from '../utils/sanitize-path.js';
import { loadGraphStore } from '../utils/graph-loader.js';

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
    },
    required: ['specPath', 'diff', 'testOutput'],
  },
};

/**
 * Resolve a real AnalysisProvider for the evaluator. Mirrors
 * summarize-session.ts: construct AnthropicAnalysisProvider directly when an
 * ANTHROPIC_API_KEY is present. Returns null when none is configured — the
 * caller degrades to an advisory verdict rather than throwing.
 */
async function resolveAnalysisProvider(model?: string): Promise<unknown> {
  try {
    const intelligence = (await import('@harness-engineering/intelligence')) as Record<
      string,
      unknown
    >;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const Provider = intelligence.AnthropicAnalysisProvider as
      | (new (opts: { apiKey: string; defaultModel?: string }) => unknown)
      | undefined;
    if (typeof Provider !== 'function') return null;
    return new Provider(model !== undefined ? { apiKey, defaultModel: model } : { apiKey });
  } catch {
    return null;
  }
}

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
  evaluate: (i: { specPath: string; diff: string; testOutput: string }) => Promise<unknown>;
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

export async function handleOutcomeEval(input: OutcomeEvalToolInput): Promise<ToolResponse> {
  const validationError = validateInput(input);
  if (validationError !== null) return errorResponse(validationError);

  try {
    const evaluator = await buildEvaluator(input);
    const verdict = await evaluator.evaluate({
      specPath: input.specPath,
      diff: input.diff,
      testOutput: input.testOutput,
    });

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
