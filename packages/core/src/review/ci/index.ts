// Phase 1: CI review contract (schema + runner-preset registry).
export {
  CiReviewVerdictSchema,
  parseCiReviewVerdict,
  CI_REVIEW_VERDICT_SCHEMA_VERSION,
  CI_RUNNERS,
  CI_ASSESSMENTS,
} from './verdict-schema';
export type { CiReviewVerdict, CiRunner } from './verdict-schema';

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
export { parseLocalVerdict } from './parsers/local';
