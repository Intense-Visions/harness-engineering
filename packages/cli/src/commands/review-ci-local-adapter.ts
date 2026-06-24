import { z } from 'zod';
import { OpenAICompatibleAnalysisProvider } from '@harness-engineering/intelligence';
import type { LocalEndpointInvoke } from '@harness-engineering/core';

/**
 * Zod schema mirroring core's `ReviewFinding` so the openai-compatible provider
 * returns structured output that re-serializes into the `{ assessment, findings }`
 * shape core's `parseLocalVerdict` consumes.
 */
const FindingSchema = z.object({
  id: z.string(),
  file: z.string(),
  lineRange: z.tuple([z.number(), z.number()]),
  domain: z.enum(['compliance', 'bug', 'security', 'architecture', 'learnings']),
  severity: z.enum(['critical', 'important', 'suggestion']),
  title: z.string(),
  rationale: z.string(),
  suggestion: z.string().optional(),
  evidence: z.array(z.string()),
});

const LocalVerdictSchema = z.object({
  assessment: z.enum(['approve', 'comment', 'request-changes']),
  findings: z.array(FindingSchema),
});

/** Cap on the surfaced error text — keeps stored artifacts/stdout bounded. */
const MAX_SURFACED_ERROR_LEN = 200;

/**
 * Sanitize a provider error before it is surfaced into stdout / the `--json`
 * artifact (core records it as `skipReason`). Strips obvious request context that
 * could leak when `HARNESS_LOCAL_API_KEY` is pointed at a real remote service:
 * URLs (with any query/token), bearer/key-looking tokens, and over-long payloads.
 * The result is deliberately terse — the operator learns the local runner failed
 * without the endpoint/credential context being persisted.
 */
function sanitizeProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const redacted = raw
    // Drop full URLs (and any embedded query string / token).
    .replace(/https?:\/\/\S+/gi, '[endpoint]')
    // Drop authorization-header / api-key style fragments.
    .replace(/\b(bearer|authorization|api[-_]?key|token)\b\s*[:=]?\s*\S+/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  const capped =
    redacted.length > MAX_SURFACED_ERROR_LEN
      ? redacted.slice(0, MAX_SURFACED_ERROR_LEN - 1) + '…'
      : redacted;
  return `local runner provider error: ${capped}`;
}

/**
 * Build the `local` runner's {@link LocalEndpointInvoke} adapter.
 *
 * Core resolves `endpoint`/`model` from env and calls this with the unified diff;
 * we construct an {@link OpenAICompatibleAnalysisProvider}, ask it for a verdict
 * shaped like {@link LocalVerdictSchema}, and return the result re-serialized as a
 * JSON string so core's `parseLocalVerdict` can validate-then-derive it.
 *
 * Many local OpenAI-compatible servers (Ollama, LM Studio, vLLM) accept any API
 * key; the provider requires a non-empty string, so we default to `'local'`.
 *
 * A provider failure is re-thrown (sanitized) rather than swallowed: core treats a
 * required-runner execution failure as blocking, so the rejection must propagate as
 * a runner failure — never a silent pass.
 */
export function createLocalInvoke(): LocalEndpointInvoke {
  return async ({ endpoint, model, instruction, diff }) => {
    // Permissive but sane: a fat-fingered HARNESS_LOCAL_ENDPOINT (missing scheme,
    // an ftp:// typo, etc.) gets a clear error here instead of an opaque provider
    // failure. localhost over http is explicitly fine.
    if (!/^https?:\/\//i.test(endpoint)) {
      throw new Error(
        `HARNESS_LOCAL_ENDPOINT must be an http(s) URL (got '${endpoint}'); e.g. http://localhost:1234/v1`
      );
    }
    const provider = new OpenAICompatibleAnalysisProvider({
      apiKey: process.env.HARNESS_LOCAL_API_KEY ?? 'local',
      baseUrl: endpoint,
      defaultModel: model,
    });
    try {
      const { result } = await provider.analyze({
        prompt: `${instruction}\n\n---\nDIFF UNDER REVIEW:\n${diff}`,
        responseSchema: LocalVerdictSchema,
        model,
      });
      return JSON.stringify(result);
    } catch (err) {
      // Surfaced `.message` is sanitized (no URL/secret context, length-capped) so it
      // is safe to record in stdout / the --json `skipReason`. `cause` retains the raw
      // error for local stack traces only — it is NOT part of the serialized artifact.
      throw new Error(sanitizeProviderError(err), { cause: err });
    }
  };
}
