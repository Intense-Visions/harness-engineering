// outcome-eval — post-execution spec-satisfaction judgment (Phase 1: types & contract)
export type {
  Verdict,
  Confidence,
  JudgedAgainst,
  Authority,
  OutcomeEvalInput,
  OutcomeVerdict,
} from './types.js';
export { deriveAuthority } from './authority.js';
export { verdictSchema } from './prompts.js';
export type { LlmVerdict } from './prompts.js';
export { resolveSection } from './section-resolver.js';
export type { ResolvedSection } from './section-resolver.js';
