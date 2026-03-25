/**
 * Orchestrates the execution of multiple skills in a sequential or turn-based pipeline.
 */
export { runPipeline, runMultiTurnPipeline } from './skill-pipeline';

/**
 * Type definitions for pipeline options, results, and skill/turn executors.
 */
export type {
  PipelineOptions,
  PipelineResult,
  SkillExecutor,
  TurnExecutor,
} from './skill-pipeline';
