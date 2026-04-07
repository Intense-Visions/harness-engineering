/**
 * Predefined cognitive modes for skills.
 */
export const STANDARD_COGNITIVE_MODES = [
  'adversarial-reviewer',
  'constructive-architect',
  'meticulous-implementer',
  'diagnostic-investigator',
  'advisory-guide',
  'meticulous-verifier',
] as const;

/**
 * Cognitive mode of a skill, determining its behavior and persona.
 */
export type CognitiveMode = (typeof STANDARD_COGNITIVE_MODES)[number] | (string & {});

/**
 * Static metadata for a skill.
 */
export interface SkillMetadata {
  /** Unique name of the skill */
  name: string;
  /** Semantic version string */
  version: string;
  /** Brief description of what the skill does */
  description: string;
  /** The cognitive mode this skill operates in */
  cognitive_mode?: CognitiveMode;
}

/**
 * Contextual information for a skill execution.
 */
export interface SkillContext {
  /** Name of the executing skill */
  skillName: string;
  /** Current pipeline phase */
  phase: string;
  /** Files relevant to the current execution */
  files: string[];
  /** Optional token budget — uses a plain record to avoid cross-package deps. */
  tokenBudget?: Record<string, number>;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Context for a single turn in a multi-turn skill interaction.
 */
export interface TurnContext extends SkillContext {
  /** Current turn number (1-indexed) */
  turnNumber: number;
  /** Results from previous turns in the same session */
  previousResults: unknown[];
}

/**
 * Error reported by a skill.
 */
export type SkillError = {
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Phase in which the error occurred */
  phase: string;
};

/**
 * Result of a skill execution.
 */
export type SkillResult = {
  /** Whether the skill achieved its goal */
  success: boolean;
  /** List of artifact paths produced */
  artifacts: string[];
  /** One-line summary of the outcome */
  summary: string;
};

/**
 * Lifecycle hooks for skills.
 */
export interface SkillLifecycleHooks {
  /** Called before the skill starts execution */
  preExecution?: (context: SkillContext) => SkillContext | null;
  /** Called before each turn in a multi-turn interaction */
  perTurn?: (context: TurnContext) => TurnContext | null;
  /** Called after the skill completes execution */
  postExecution?: (context: SkillContext, result: SkillResult) => void;
}
