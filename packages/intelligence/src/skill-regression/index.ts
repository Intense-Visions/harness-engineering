// Skill-Regression — golden-fixture evaluation framework that detects when a
// skill regresses. Reuses the outcome-eval judge pattern: an LLM rules each
// rubric criterion, TypeScript computes the score and the ship authority.

export { deriveRegressionAuthority } from './authority.js';
export {
  SKILL_REGRESSION_SYSTEM_PROMPT,
  buildUserPrompt,
  criterionJudgmentSchema,
  judgeResponseSchema,
} from './prompts.js';
export type { JudgeResponse } from './prompts.js';
export { weightedScore, aggregateAtK, regressionFloor, deriveRegressionVerdict } from './scorer.js';
export { fixtureSchema, parseFixture, serializeFixture } from './fixture.js';
export { SkillRegressionEvaluator, computeBaselineScore } from './evaluator.js';
export type { SkillRegressionEvaluatorOptions } from './evaluator.js';
export type {
  RegressionVerdictKind,
  Confidence as RegressionConfidence,
  RegressionAuthority,
  RubricCriterion,
  GoldenBaseline,
  SkillRegressionFixture,
  CriterionJudgment,
  SkillRegressionInput,
  SkillRegressionVerdict,
} from './types.js';
