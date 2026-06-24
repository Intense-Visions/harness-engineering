import type { CiReviewVerdict } from './verdict-schema';
import { parseClaudeVerdict } from './parsers/claude';
// parseGeminiVerdict is intentionally not imported here: the gemini preset is
// downgraded to `supported: false` (see below) and SUPERSEDED by the `antigravity`
// runner (the renamed `gemini` CLI, command `agy`). The parser remains exported
// from ./index for the deferred in-CI gemini-envelope verification.
import { parseCodexVerdict } from './parsers/codex';
import { parseAntigravityVerdict } from './parsers/antigravity';
import { parseLocalVerdict } from './parsers/local';

/**
 * A headless invocation descriptor: the argv the orchestrator shells out to.
 *
 * The unified diff is supplied to the child process over STDIN — the orchestrator
 * (Phase 2) pipes it in. None of the verified CLIs (claude, codex) accept a diff
 * via a flag/path argument; both read from STDIN and take the review instruction
 * as a prompt. (Confirmed against the real CLIs in the Phase 1 Task 10 smoke test.)
 */
export interface HeadlessInvocation {
  /** Executable name expected on PATH (e.g. 'claude'). */
  command: string;
  /** Args builder given the review instruction (the diff is piped via STDIN). */
  args: (opts: { instruction: string }) => string[];
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
  headlessInvocation: (opts: { instruction: string }) => {
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

export type AgentCliRunnerId = 'claude' | 'gemini' | 'antigravity' | 'codex' | 'cursor';
export type EndpointRunnerId = 'local';
export type RunnerId = AgentCliRunnerId | EndpointRunnerId;

export const RUNNER_PRESETS: Record<RunnerId, RunnerPreset> = {
  claude: {
    kind: 'agent-cli',
    supported: true,
    secretEnvVar: 'ANTHROPIC_API_KEY',
    // Verified (Task 10 smoke test): diff piped via STDIN, instruction as the
    // `-p` prompt, JSON transcript on stdout. There is NO `--input-file` flag.
    headlessInvocation: ({ instruction }) => ({
      command: 'claude',
      args: ['-p', instruction, '--output-format', 'json'],
    }),
    verdictParser: parseClaudeVerdict,
  },
  gemini: {
    kind: 'agent-cli',
    supported: false,
    // argv corrected from `gemini --help` (NOT `--json`; it is `-o json`, and there
    // is no `--file` flag — the diff goes on STDIN):
    //   command: 'gemini'
    //   args: ['-p', instruction, '-o', 'json']   // diff piped via STDIN
    // Re-enable by restoring `supported: true`, `secretEnvVar: 'GEMINI_API_KEY'`,
    // the headlessInvocation above, and `verdictParser: parseGeminiVerdict` once
    // the output envelope is captured in CI.
    unsupportedReason:
      'SUPERSEDED by the `antigravity` runner (use `--runner antigravity`): the Gemini agentic ' +
      'CLI was renamed to Antigravity (command `agy`), which authenticates locally and produces ' +
      'a capturable verdict where this `gemini` CLI did not. Retained as a valid runner id for ' +
      'back-compat. Original deferral note: gemini argv corrected from --help ' +
      '(`gemini -p <instruction> -o json`, diff on STDIN), but the JSON output envelope is ' +
      'UNVERIFIED: no GEMINI_API_KEY was available in the authoring environment, so the CLI fell ' +
      'through to interactive OAuth and produced no capturable result. Verification deferred to a ' +
      'real CI run with credentials.',
  },
  antigravity: {
    kind: 'agent-cli',
    supported: true,
    // agy is authenticated locally via OAuth here (no API key needed for local
    // runs). For CI, the gating secret is uncertain — this is a BEST-GUESS pending
    // CI verification: antigravity is Gemini-family (the renamed `gemini` CLI), so
    // GEMINI_API_KEY is the most likely credential. Local auth is OAuth-based and
    // needs no secret; confirm/correct this against a real CI run.
    secretEnvVar: 'GEMINI_API_KEY',
    // Verified live against the real CLI: diff piped via STDIN, instruction as the
    // `--print` prompt. There is NO `--output-format`/`--json` flag (it errors
    // `flags provided but not defined: -output-format`); `--print` (alias
    // `--prompt`) runs a single non-interactive prompt and emits the model's
    // response as plain text. Consistent with the claude/codex STDIN diff model.
    headlessInvocation: ({ instruction }) => ({
      command: 'agy',
      args: ['--print', instruction],
    }),
    verdictParser: parseAntigravityVerdict,
  },
  codex: {
    kind: 'agent-cli',
    supported: true,
    secretEnvVar: 'OPENAI_API_KEY',
    // Verified (Task 10 smoke test): diff piped via STDIN, instruction as the
    // positional prompt, JSONL event stream on stdout. There is NO `--file` flag.
    headlessInvocation: ({ instruction }) => ({
      command: 'codex',
      args: ['exec', '--json', instruction],
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
