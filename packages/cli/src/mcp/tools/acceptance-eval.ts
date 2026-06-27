/**
 * MCP tool: `mcp__harness__acceptance_eval`.
 *
 * Pre-execution acceptance-criteria measurability judgment — the upstream twin
 * of `outcome_eval`. Wraps the intelligence-package `AcceptanceEvaluator` so an
 * agent can run the TS-derived-authority seam (evaluate -> deriveAcceptanceAuthority)
 * rather than emulating the verdict in chat (ADR: authority is never read from
 * the LLM, extended to a pre-execution gate).
 *
 * Provider resolution mirrors `outcome-eval.ts`: a real `AnalysisProvider`
 * (`.analyze<T>()`) is constructed only when `ANTHROPIC_API_KEY` is present;
 * otherwise an always-rejecting stub makes the evaluator degrade safely to
 * INCONCLUSIVE/low/advisory — never blocking.
 *
 * NOTE (persistence seam, deferred): unlike `outcome-eval`, this tool takes no
 * `path?` and holds no GraphStore. There is no acceptance-outcome node type and
 * Phase 1 did not persist verdicts (spec non-goals defer graph-backed work,
 * handoff concern C1). When persistence lands, add a `path?` input and a graph
 * write here — the evaluator surface is unchanged.
 *
 * Source: docs/changes/harness-pm-persona/proposal.md (Technical design -> MCP tool).
 */

import { readFile } from 'node:fs/promises';
import { findFiles } from '../../utils/files.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface AcceptanceEvalToolInput {
  /** Absolute or repo-relative path to the spec markdown. Required. */
  specPath: string;
  /** Glob(s) locating test files; their contents become the (b) evidence. */
  testGlobs?: string[];
  /** Pre-collected test snippets (the (b) evidence), used as-is when present. */
  testContent?: string;
  /** Optional model override for the acceptance-eval LLM call. */
  model?: string;
}

export const acceptanceEvalDefinition = {
  name: 'acceptance_eval',
  description:
    'Pre-execution LLM-judgment: does a spec carry measurable, testable, complete ' +
    "acceptance criteria? The upstream twin of outcome_eval. Reads the spec's " +
    'success/acceptance section, emits a confidence-rated AcceptanceVerdict ' +
    '(MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE) with criteriaFindings (a, advisory), ' +
    'coverageFindings (b, advisory) and a rationale. Authority is DERIVED in TypeScript, ' +
    'never trusted from the LLM: a high-confidence NOT_MEASURABLE is blocking; every ' +
    'other verdict is advisory. testGlobs/testContent are optional evidence for (b) — ' +
    'omitting them degrades coverage findings to advisory-empty but never affects the ' +
    'measurability gate.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      specPath: {
        type: 'string',
        description: 'Absolute or repo-relative path to the spec markdown to judge',
      },
      testGlobs: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional globs locating test files; their contents supply the (b) coverage ' +
          'evidence. Ignored when testContent is provided. Absolute globs are recommended; ' +
          'relative globs resolve against the MCP server cwd.',
      },
      testContent: {
        type: 'string',
        description:
          'Optional pre-collected test snippets (the (b) evidence). Takes precedence ' +
          'over testGlobs.',
      },
      model: {
        type: 'string',
        description: 'Optional model override for the acceptance-eval LLM call',
      },
    },
    required: ['specPath'],
  },
};

/**
 * Resolve a real AnalysisProvider. Mirrors outcome-eval.ts: construct
 * AnthropicAnalysisProvider when ANTHROPIC_API_KEY is present; otherwise null,
 * so the caller substitutes an always-rejecting stub and the verdict degrades.
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

/** Validate required inputs. Returns an error message or null. */
function validateInput(input: AcceptanceEvalToolInput): string | null {
  if (typeof input?.specPath !== 'string' || input.specPath.length === 0) {
    return 'acceptance_eval: `specPath` is required';
  }
  return null;
}

/**
 * Resolve the (b) coverage evidence into a single string. testContent wins;
 * otherwise read every file matched by testGlobs. Always degrade-safe: an
 * unmatched/unreadable glob yields undefined, so (b) stays advisory-empty and
 * the (c) gate is unaffected.
 */
export async function resolveTestContent(
  input: AcceptanceEvalToolInput
): Promise<string | undefined> {
  if (typeof input.testContent === 'string' && input.testContent.length > 0) {
    return input.testContent;
  }
  if (!Array.isArray(input.testGlobs) || input.testGlobs.length === 0) {
    return undefined;
  }
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const pattern of input.testGlobs) {
    // Glob patterns are POSIX-separated; normalize Windows backslashes so a
    // path.join-built glob still matches on win32 (the glob lib treats `\` as
    // an escape, which otherwise silently matches nothing).
    const normalized = pattern.replace(/\\/g, '/');
    let files: string[];
    try {
      files = await findFiles(normalized);
    } catch {
      continue; // unmatched/invalid glob: degrade-safe skip
    }
    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);
      try {
        parts.push(`// ${file}\n${await readFile(file, 'utf8')}`);
      } catch {
        // unreadable file: skip, never throw
      }
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

export async function handleAcceptanceEval(input: AcceptanceEvalToolInput): Promise<ToolResponse> {
  const validationError = validateInput(input);
  if (validationError !== null) return errorResponse(validationError);

  try {
    const { AcceptanceEvaluator } = await import('@harness-engineering/intelligence');
    const provider = await resolveAnalysisProvider(input.model);
    const evaluator = new AcceptanceEvaluator(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider ?? unconfiguredProvider()) as any,
      input.model !== undefined ? { model: input.model } : {}
    );

    const testContent = await resolveTestContent(input);
    const verdict = await evaluator.evaluate({
      specPath: input.specPath,
      ...(testContent !== undefined && { testContent }),
    });

    // Return the verdict EXACTLY as produced — authority is TS-derived
    // (deriveAcceptanceAuthority); the handler never recomputes or overrides it.
    return { content: [{ type: 'text', text: JSON.stringify(verdict, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(`acceptance_eval failed: ${message}`);
  }
}

/**
 * A provider whose analyze() always rejects. Used only when no real provider is
 * configured: the evaluator's judge() catches the rejection and degrades to
 * INCONCLUSIVE/low/advisory, so "missing provider => never blocks" holds
 * without special-casing in the handler.
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
