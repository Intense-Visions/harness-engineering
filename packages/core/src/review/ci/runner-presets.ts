import type { CiReviewVerdict } from './verdict-schema';
import { parseClaudeVerdict } from './parsers/claude';
import { parseGeminiVerdict } from './parsers/gemini';
import { parseCodexVerdict } from './parsers/codex';

/** A headless invocation descriptor: the argv the orchestrator shells out to. */
export interface HeadlessInvocation {
  /** Executable name expected on PATH (e.g. 'claude'). */
  command: string;
  /** Args builder given the review instruction + diff path. */
  args: (opts: { instruction: string; diffPath: string }) => string[];
}

interface SupportedPreset {
  supported: true;
  secretEnvVar: string;
  headlessInvocation: (opts: { instruction: string; diffPath: string }) => {
    command: string;
    args: string[];
  };
  verdictParser: (raw: string) => CiReviewVerdict;
}

interface UnsupportedPreset {
  supported: false;
  unsupportedReason: string;
}

export type RunnerPreset = SupportedPreset | UnsupportedPreset;

export type SupportedRunnerId = 'claude' | 'gemini' | 'codex';
export type RunnerId = SupportedRunnerId | 'cursor';

export const RUNNER_PRESETS: Record<RunnerId, RunnerPreset> = {
  claude: {
    supported: true,
    secretEnvVar: 'ANTHROPIC_API_KEY',
    headlessInvocation: ({ instruction, diffPath }) => ({
      command: 'claude',
      args: ['-p', instruction, '--input-file', diffPath, '--output-format', 'json'],
    }),
    verdictParser: parseClaudeVerdict,
  },
  gemini: {
    supported: true,
    secretEnvVar: 'GEMINI_API_KEY',
    headlessInvocation: ({ instruction, diffPath }) => ({
      command: 'gemini',
      args: ['--prompt', instruction, '--file', diffPath, '--json'],
    }),
    verdictParser: parseGeminiVerdict,
  },
  codex: {
    supported: true,
    secretEnvVar: 'OPENAI_API_KEY',
    headlessInvocation: ({ instruction, diffPath }) => ({
      command: 'codex',
      args: ['exec', '--json', instruction, '--file', diffPath],
    }),
    verdictParser: parseCodexVerdict,
  },
  cursor: {
    supported: false,
    unsupportedReason:
      'cursor headless CI invocation is unverified and the CLI is not present in this environment; ' +
      'deferred to a real CI run per the required-review-ci re-scope decision.',
  },
};

export function isSupportedRunner(id: RunnerId): id is SupportedRunnerId {
  return RUNNER_PRESETS[id].supported === true;
}
