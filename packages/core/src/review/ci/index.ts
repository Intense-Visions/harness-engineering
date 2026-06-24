// Phase 1: CI review contract (schema + runner-preset registry).
export {
  CiReviewVerdictSchema,
  parseCiReviewVerdict,
  buildCiReviewVerdict,
  deriveBlockingFindings,
  deriveExitCode,
  CI_REVIEW_VERDICT_SCHEMA_VERSION,
  CI_RUNNERS,
  CI_ASSESSMENTS,
  CI_REVIEW_DOMAINS,
} from './verdict-schema';
export type { CiReviewVerdict, CiRunner, CiReviewVerdictParts } from './verdict-schema';

export { RUNNER_PRESETS, isSupportedRunner, presetKind } from './runner-presets';
export type {
  RunnerPreset,
  AgentCliPreset,
  EndpointPreset,
  RunnerId,
  AgentCliRunnerId,
  EndpointRunnerId,
  HeadlessInvocation,
  LocalEndpointInvoke,
} from './runner-presets';

export { parseClaudeVerdict } from './parsers/claude';
export { parseGeminiVerdict } from './parsers/gemini';
export { parseCodexVerdict } from './parsers/codex';
export { parseAntigravityVerdict } from './parsers/antigravity';
export { parseLocalVerdict } from './parsers/local';

// Phase 2: CI review orchestrator (floor + secret-gated LLM tier + block-on threshold).
export {
  runCiReview,
  defaultExecFile,
  DEFAULT_EXEC_TIMEOUT_MS,
  DEFAULT_EXEC_MAX_STDOUT_BYTES,
} from './orchestrator';
export type { RunCiReviewOptions, CiReviewResult, CiBlockOn, ExecFileLike } from './orchestrator';
