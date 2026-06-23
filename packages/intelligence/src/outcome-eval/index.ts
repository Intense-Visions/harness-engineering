// outcome-eval — post-execution spec-satisfaction judgment (Phase 3: evaluator & prompts)
export type {
  Verdict,
  Confidence,
  JudgedAgainst,
  Authority,
  OutcomeEvalInput,
  OutcomeVerdict,
} from './types.js';
export { deriveAuthority } from './authority.js';
export { verdictSchema, OUTCOME_EVAL_SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
export type { LlmVerdict } from './prompts.js';
export { resolveSection } from './section-resolver.js';
export type { ResolvedSection } from './section-resolver.js';
export { OutcomeEvaluator } from './evaluator.js';
export type { OutcomeEvaluatorOptions } from './evaluator.js';
