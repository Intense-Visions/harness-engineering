import { createCanaryAdapter, type CanaryAdapter } from '@harness-engineering/intelligence';

/**
 * MCP surface for the optional canary test CLI, backed by the CanaryAdapter in
 * @harness-engineering/intelligence. The adapter is total — it never throws when
 * canary is absent — so these handlers stay thin and always return a JSON body the
 * test-advisor audit can branch on.
 */

export const canaryProbeDefinition = {
  name: 'canary_probe',
  description:
    'Probe availability of the optional canary test CLI (canary-test-cli). Returns ' +
    '{ status: "available" | "degraded", version?, reason? } where reason is one of ' +
    'not-installed | binary-missing | exec-failed | bad-output. Never errors when canary ' +
    'is absent — call it before surfacing canary-backed steps so the audit can degrade gracefully.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
};

export const canaryRecommendFrameworkDefinition = {
  name: 'canary_recommend_framework',
  description:
    'Classify a test prompt with canary and recommend a framework (deterministic, no API key). ' +
    'Returns { status, test_type, framework, file_extension, reasoning[], alternatives[] }. ' +
    'Degrades to a { status: "degraded" } sentinel when canary is unavailable.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      prompt: {
        type: 'string',
        description:
          'Natural-language description of the test to scaffold, e.g. "end-to-end login flow in the browser".',
      },
    },
    required: ['prompt'],
  },
};

export const canaryRunHistoryDefinition = {
  name: 'canary_run_history',
  description:
    "Read canary's persisted structured run history (NDJSON at " +
    'test-results/reports/history-v2.jsonl) as a validated array of RunRecords ' +
    '(run outcome + per-test status/failure_category/retry_count/flaky). ' +
    'Optional { path?, limit? }: path is the project root (default cwd); limit caps ' +
    'to the most-recent N runs. Returns [] (never errors) when canary has produced no ' +
    'results or the store is missing/unreadable/malformed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root (default: cwd)' },
      limit: { type: 'number', description: 'Cap to the most-recent N run records' },
    },
  },
};

function jsonResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export async function handleCanaryProbe(
  _input: unknown,
  adapter: CanaryAdapter = createCanaryAdapter()
) {
  return jsonResponse(await adapter.probe());
}

export async function handleCanaryRecommendFramework(
  input: { prompt?: unknown },
  adapter: CanaryAdapter = createCanaryAdapter()
) {
  const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Error: "prompt" is required and must be a non-empty string.',
        },
      ],
      isError: true,
    };
  }
  return jsonResponse(await adapter.recommendFramework(prompt));
}

export async function handleCanaryRunHistory(
  input: { path?: unknown; limit?: unknown },
  adapter: CanaryAdapter = createCanaryAdapter()
) {
  const cwd = typeof input?.path === 'string' ? input.path : undefined;
  const limit = typeof input?.limit === 'number' ? input.limit : undefined;
  return jsonResponse(
    await adapter.readRunHistory({
      ...(cwd ? { cwd } : {}),
      ...(limit !== undefined ? { limit } : {}),
    })
  );
}
