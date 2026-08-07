import {
  createCanaryAdapter,
  resolveTestCommand,
  type CanaryAdapter,
  type CanaryFrameworkInfo,
} from '@harness-engineering/intelligence';

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

export const canaryDiscoverTestCommandDefinition = {
  name: 'canary_discover_test_command',
  description:
    'Resolve the authoritative per-file test command from the canary framework registry. ' +
    'Input { files?: string[], ci?: boolean }. Probes canary first; when unavailable returns ' +
    '{ status: "degraded", reason, frameworks: [] } so the caller falls back to its own ' +
    'command heuristics. When available, matches each file against a framework by longest ' +
    'file-extension suffix (preferring preferred-status / full-tier frameworks, then registry ' +
    'order on ties) and returns { status: "available", frameworks: [{ name, command, ' +
    'matchedFiles[] }] }. Frameworks without a resolvable per-file command (null or ' +
    'non-{file} commands) are omitted. Never runs the resolved command and never throws.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Candidate test-file paths to match against the registry (e.g. detected spec/test files).',
      },
      ci: {
        type: 'boolean',
        description: "When true, append each framework's ci_flags to the resolved command.",
      },
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

interface DiscoveredFramework {
  name: string;
  command: string;
  matchedFiles: string[];
}

/** Negative when `a` should be preferred over `b`: preferred status, then full tier. */
function tieScore(fw: CanaryFrameworkInfo): number {
  return (fw.status === 'preferred' ? 2 : 0) + (fw.tier === 'full' ? 1 : 0);
}

/**
 * Longest file-extension suffix match for one file. Ties are broken first by
 * preferred/full score, then by registry order (first-listed wins — canary lists
 * preferred runners first). Returns null when no extension matches.
 */
function bestFrameworkForFile(
  file: string,
  frameworks: CanaryFrameworkInfo[]
): CanaryFrameworkInfo | null {
  let best: { fw: CanaryFrameworkInfo; len: number } | null = null;
  for (const fw of frameworks) {
    for (const ext of fw.file_extensions) {
      if (!file.endsWith(`.${ext}`)) continue;
      const len = ext.length;
      const better =
        best === null || len > best.len || (len === best.len && tieScore(fw) > tieScore(best.fw));
      if (better) best = { fw, len };
    }
  }
  return best?.fw ?? null;
}

export async function handleCanaryDiscoverTestCommand(
  input: { files?: unknown; ci?: unknown },
  adapter: CanaryAdapter = createCanaryAdapter()
) {
  const files = Array.isArray(input?.files)
    ? input.files.filter((f): f is string => typeof f === 'string')
    : [];
  const ci = input?.ci === true;

  const probe = await adapter.probe();
  if (probe.status !== 'available') {
    return jsonResponse({ status: 'degraded', reason: probe.reason, frameworks: [] });
  }

  const registry = await adapter.listFrameworks();
  const byName = new Map<string, DiscoveredFramework>();
  for (const file of files) {
    const fw = bestFrameworkForFile(file, registry);
    if (!fw) continue;
    const command = resolveTestCommand(fw, file, { ci });
    if (command === null) continue; // no-{file} / null-command frameworks are omitted
    const existing = byName.get(fw.name);
    if (existing) existing.matchedFiles.push(file);
    else byName.set(fw.name, { name: fw.name, command, matchedFiles: [file] });
  }

  return jsonResponse({ status: 'available', frameworks: [...byName.values()] });
}
