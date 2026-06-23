import type { CiReviewVerdict } from './verdict-schema';
import { parseClaudeVerdict } from './parsers/claude';
import { parseGeminiVerdict } from './parsers/gemini';
import { parseCodexVerdict } from './parsers/codex';
import { parseLocalVerdict } from './parsers/local';

/** A headless invocation descriptor: the argv the orchestrator shells out to. */
export interface HeadlessInvocation {
  /** Executable name expected on PATH (e.g. 'claude'). */
  command: string;
  /** Args builder given the review instruction + diff path. */
  args: (opts: { instruction: string; diffPath: string }) => string[];
}

/**
 * Injected seam for the `local` endpoint runner. Core does NOT import the
 * openai-compatible analysis provider (that lives in @harness-engineering/intelligence,
 * a sibling package core must not depend on — see LAYER DECISION below). Phase 2's
 * orchestrator constructs an OpenAICompatibleAnalysisProvider and adapts it to this
 * function type, then calls the preset's verdictParser on the returned JSON string.
 *
 * LAYER DECISION (required-review-ci, amended spec D3/D7): `invoke` is a typed
 * injected-function seam, NOT a direct provider import. packages/core depends only
 * on @harness-engineering/{graph,types}; packages/intelligence (which owns the
 * provider) is a sibling that itself pulls in `openai`/`@anthropic-ai/sdk`. Importing
 * it from core would be a layer violation AND a new dependency (both forbidden). The
 * orchestrator in a higher layer wires the real provider to this seam.
 */
export type LocalEndpointInvoke = (opts: {
  /** Resolved endpoint base URL (from endpointEnvVar). */
  endpoint: string;
  /** Resolved model name (from modelEnvVar). */
  model: string;
  /** The review instruction prompt. */
  instruction: string;
  /** The unified diff under review. */
  diff: string;
}) => Promise<string>;

interface AgentCliSupported {
  kind: 'agent-cli';
  supported: true;
  secretEnvVar: string;
  headlessInvocation: (opts: { instruction: string; diffPath: string }) => {
    command: string;
    args: string[];
  };
  verdictParser: (raw: string) => CiReviewVerdict;
}

interface AgentCliUnsupported {
  kind: 'agent-cli';
  supported: false;
  unsupportedReason: string;
}

interface EndpointSupported {
  kind: 'endpoint';
  supported: true;
  endpointEnvVar: string;
  modelEnvVar: string;
  /**
   * Injected at orchestration time by a higher layer (see LocalEndpointInvoke).
   * Optional on the preset: the deterministic surface (env-var seams + parser) is
   * what Phase 1 ships and unit-tests; the live call is wired in Phase 2.
   */
  invoke?: LocalEndpointInvoke;
  verdictParser: (raw: string) => CiReviewVerdict;
}

interface EndpointUnsupported {
  kind: 'endpoint';
  supported: false;
  endpointEnvVar: string;
  modelEnvVar: string;
  unsupportedReason: string;
}

export type AgentCliPreset = AgentCliSupported | AgentCliUnsupported;
export type EndpointPreset = EndpointSupported | EndpointUnsupported;
export type RunnerPreset = AgentCliPreset | EndpointPreset;

export type AgentCliRunnerId = 'claude' | 'gemini' | 'codex' | 'cursor';
export type EndpointRunnerId = 'local';
export type RunnerId = AgentCliRunnerId | EndpointRunnerId;

export const RUNNER_PRESETS: Record<RunnerId, RunnerPreset> = {
  claude: {
    kind: 'agent-cli',
    supported: true,
    secretEnvVar: 'ANTHROPIC_API_KEY',
    headlessInvocation: ({ instruction, diffPath }) => ({
      command: 'claude',
      args: ['-p', instruction, '--input-file', diffPath, '--output-format', 'json'],
    }),
    verdictParser: parseClaudeVerdict,
  },
  gemini: {
    kind: 'agent-cli',
    supported: true,
    secretEnvVar: 'GEMINI_API_KEY',
    headlessInvocation: ({ instruction, diffPath }) => ({
      command: 'gemini',
      args: ['--prompt', instruction, '--file', diffPath, '--json'],
    }),
    verdictParser: parseGeminiVerdict,
  },
  codex: {
    kind: 'agent-cli',
    supported: true,
    secretEnvVar: 'OPENAI_API_KEY',
    headlessInvocation: ({ instruction, diffPath }) => ({
      command: 'codex',
      args: ['exec', '--json', instruction, '--file', diffPath],
    }),
    verdictParser: parseCodexVerdict,
  },
  cursor: {
    kind: 'agent-cli',
    supported: false,
    unsupportedReason:
      'cursor headless CI invocation is unverified and the CLI is not present in this environment; ' +
      'deferred to a real CI run per the required-review-ci re-scope decision.',
  },
  local: {
    kind: 'endpoint',
    supported: true,
    endpointEnvVar: 'HARNESS_LOCAL_ENDPOINT',
    modelEnvVar: 'HARNESS_LOCAL_MODEL',
    // `invoke` is intentionally left unset here — it is the injected seam Phase 2
    // wires to the openai-compatible provider (see LocalEndpointInvoke). The
    // deterministic surface (env-var seams + verdictParser) is what Phase 1 ships
    // and unit-tests; live single-pass verification is DEFERRED (no endpoint here).
    verdictParser: parseLocalVerdict,
  },
};

export function presetKind(id: RunnerId): RunnerPreset['kind'] {
  return RUNNER_PRESETS[id].kind;
}

export function isSupportedRunner(id: RunnerId): boolean {
  return RUNNER_PRESETS[id].supported === true;
}
