/**
 * Hermes Phase 1 — LLM-driven session summary.
 *
 * Hooks `archiveSession()` to invoke an `AnalysisProvider` against the
 * archived session's markdown files and write a structured `llm-summary.md`
 * inside the archive directory.
 *
 * Spec: docs/changes/hermes-phase-1-session-search/proposal.md (D3, D4)
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  SessionSummarySchema,
  type SessionSummary,
  type SessionSummaryMeta,
  type HermesSummaryConfig,
} from '@harness-engineering/types';
import { Ok, Err, type Result } from '@harness-engineering/types';
import type { AnalysisProvider } from '@harness-engineering/intelligence';

const LLM_SUMMARY_FILE = 'llm-summary.md';

/**
 * Source files (relative to the archive dir) that feed the summary prompt.
 * Order matters — the LLM gets them with `## FILE: <kind>` separators.
 */
const SUMMARY_INPUT_FILES: Array<{ filename: string; kind: string }> = [
  { filename: 'summary.md', kind: 'summary' },
  { filename: 'learnings.md', kind: 'learnings' },
  { filename: 'failures.md', kind: 'failures' },
  { filename: 'session-sections.md', kind: 'sections' },
];

const DEFAULT_INPUT_BUDGET_TOKENS = 16_000;
const DEFAULT_TIMEOUT_MS = 60_000;
/** Approximate char-to-token ratio used for cap enforcement only. */
const CHARS_PER_TOKEN = 4;

const SYSTEM_PROMPT = `You produce concise, structured retrospectives of completed harness-engineering sessions.

Read the session's archived markdown files and emit a JSON object that conforms exactly to the provided schema. Be specific and grounded — quote artefacts (file names, skill names, error messages) verbatim when relevant. Do not invent. If a field has no content, return an empty array.`;

const USER_PROMPT_PREAMBLE = `Below are the archived files for a single harness-engineering session. Produce a structured summary capturing:
- headline: one-sentence retrospective (≤ 120 chars)
- keyOutcomes: concrete things that shipped / decisions made (≤ 20 strings)
- openQuestions: items still open (≤ 20 strings)
- relatedSessions: other session slugs referenced (may be empty)

---

`;

export interface SummarizeContext {
  /** Path to the archived session directory, e.g. .harness/archive/sessions/foo-2026-05-16. */
  archiveDir: string;
  /** Resolved AnalysisProvider — caller skips this step when no provider is available. */
  provider: AnalysisProvider;
  /** Optional Hermes summary config, defaults applied when fields are missing. */
  config?: HermesSummaryConfig | undefined;
  /** Optional logger; falls back to console.warn for diagnostics. */
  logger?: { warn?: (msg: string, meta?: Record<string, unknown>) => void };
  /** When true, on provider error a stub `llm-summary.md` is still written. Default true. */
  writeStubOnError?: boolean;
}

export interface SummarizeResult {
  summary: SessionSummary;
  meta: SessionSummaryMeta;
  filePath: string;
}

/** Read and concatenate the session's input files with `## FILE:` separators. */
function readInputCorpus(archiveDir: string): string {
  const parts: string[] = [];
  for (const { filename, kind } of SUMMARY_INPUT_FILES) {
    const p = path.join(archiveDir, filename);
    if (!fs.existsSync(p)) continue;
    try {
      const content = fs.readFileSync(p, 'utf8');
      if (content.trim().length === 0) continue;
      parts.push(`## FILE: ${kind}\n\n${content.trim()}`);
    } catch {
      // ignore unreadable files; the summary call still proceeds with what we have
    }
  }
  return parts.join('\n\n');
}

/** Approximate token cap via char count; conservative because tokens average ~4 chars. */
export function truncateForBudget(text: string, inputBudgetTokens: number): string {
  const cap = Math.max(0, inputBudgetTokens * CHARS_PER_TOKEN);
  if (text.length <= cap) return text;
  return text.slice(0, cap) + '\n\n[TRUNCATED — input exceeded token budget]';
}

/** Render the structured summary as the `llm-summary.md` markdown payload. */
export function renderLlmSummaryMarkdown(
  summary: SessionSummary,
  meta: SessionSummaryMeta
): string {
  const lines: string[] = [
    '---',
    `generatedAt: ${meta.generatedAt}`,
    `model: ${meta.model}`,
    `inputTokens: ${meta.inputTokens}`,
    `outputTokens: ${meta.outputTokens}`,
    `schemaVersion: ${meta.schemaVersion}`,
    '---',
    '',
    '## Headline',
    summary.headline,
    '',
    '## Key outcomes',
  ];

  if (summary.keyOutcomes.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const item of summary.keyOutcomes) lines.push(`- ${item}`);
  }

  lines.push('', '## Open questions');
  if (summary.openQuestions.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const item of summary.openQuestions) lines.push(`- ${item}`);
  }

  lines.push('', '## Related sessions');
  if (summary.relatedSessions.length === 0) {
    lines.push('_(none)_');
  } else {
    for (const item of summary.relatedSessions) lines.push(`- ${item}`);
  }

  lines.push('');
  return lines.join('\n');
}

/** Write a stub file marking that summarization was attempted but failed. */
function writeStubMarkdown(archiveDir: string, reason: string): string {
  const filePath = path.join(archiveDir, LLM_SUMMARY_FILE);
  const body =
    '---\n' +
    `generatedAt: ${new Date().toISOString()}\n` +
    'schemaVersion: 1\n' +
    'status: failed\n' +
    '---\n\n' +
    '## Summary unavailable\n\n' +
    `- reason: ${reason}\n`;
  fs.writeFileSync(filePath, body, 'utf8');
  return filePath;
}

/**
 * Summarise a single archived session via the provided AnalysisProvider.
 *
 * On success: writes `llm-summary.md` into the archive directory and returns
 * the structured summary + metadata.
 *
 * On provider error: optionally writes a stub `llm-summary.md` so callers can
 * still detect that summarization was attempted, then returns `Err`.
 *
 * Empty / missing input corpus is returned as `Err` and never produces a file.
 */
export async function summarizeArchivedSession(
  ctx: SummarizeContext
): Promise<Result<SummarizeResult, Error>> {
  const writeStubOnError = ctx.writeStubOnError ?? true;

  if (!fs.existsSync(ctx.archiveDir)) {
    return Err(new Error(`archive directory not found: ${ctx.archiveDir}`));
  }

  const corpus = readInputCorpus(ctx.archiveDir);
  if (corpus.trim().length === 0) {
    return Err(new Error(`no summary input files found in ${ctx.archiveDir}`));
  }

  const inputBudgetTokens = ctx.config?.inputBudgetTokens ?? DEFAULT_INPUT_BUDGET_TOKENS;
  const truncated = truncateForBudget(corpus, inputBudgetTokens);
  const prompt = USER_PROMPT_PREAMBLE + truncated;

  const timeoutMs = ctx.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const analyzeOpts = {
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    responseSchema: SessionSummarySchema,
    ...(ctx.config?.model && { model: ctx.config.model }),
  };

  let response;
  try {
    response = await Promise.race([
      ctx.provider.analyze<SessionSummary>(analyzeOpts),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`provider call timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    ctx.logger?.warn?.('hermes summary: provider call failed', { reason });
    let stubPath: string | undefined;
    if (writeStubOnError) {
      try {
        stubPath = writeStubMarkdown(ctx.archiveDir, reason);
      } catch {
        // ignore stub write failures
      }
    }
    return Err(
      new Error(`hermes summary failed: ${reason}` + (stubPath ? ` (stub: ${stubPath})` : ''))
    );
  }

  // Provider already validates against the Zod schema; re-parse defensively.
  const parsed = SessionSummarySchema.safeParse(response.result);
  if (!parsed.success) {
    const reason = `schema validation failed: ${parsed.error.message}`;
    ctx.logger?.warn?.('hermes summary: invalid provider payload', { reason });
    if (writeStubOnError) {
      try {
        writeStubMarkdown(ctx.archiveDir, reason);
      } catch {
        // ignore stub write failures
      }
    }
    return Err(new Error(reason));
  }

  const meta: SessionSummaryMeta = {
    generatedAt: new Date().toISOString(),
    model: response.model,
    inputTokens: response.tokenUsage.inputTokens,
    outputTokens: response.tokenUsage.outputTokens,
    schemaVersion: 1,
  };

  const filePath = path.join(ctx.archiveDir, LLM_SUMMARY_FILE);
  const body = renderLlmSummaryMarkdown(parsed.data, meta);
  fs.writeFileSync(filePath, body, 'utf8');

  return Ok({ summary: parsed.data, meta, filePath });
}

/** Resolve whether summarization should run for the given config. */
export function isSummaryEnabled(config?: HermesSummaryConfig): boolean {
  if (!config) return false;
  if (config.enabled === false) return false;
  // `enabled === undefined` means "default to true when provider is available".
  // Resolution happens in the caller (it knows whether a provider exists).
  return true;
}
