import { execFile as nodeExecFile } from 'node:child_process';
import type { DiffInfo } from '../types/context';
import type { CiReviewVerdict } from './verdict-schema';
import type { RunnerId, LocalEndpointInvoke } from './runner-presets';
import { CI_ASSESSMENTS } from './verdict-schema';

/** block-on threshold: an assessment level, or 'none' to never block on assessment. */
export type CiBlockOn = (typeof CI_ASSESSMENTS)[number] | 'none';

/**
 * Injected process-spawn seam. Defaults to a node:child_process-backed impl in
 * runCiReview; unit tests pass a mock so NO real CLI is ever spawned. Returns the
 * child's captured stdout. `stdin` is the unified diff piped to the process.
 */
export type ExecFileLike = (
  command: string,
  args: string[],
  opts: { stdin: string; env: NodeJS.ProcessEnv }
) => Promise<{ stdout: string }>;

export interface RunCiReviewOptions {
  projectRoot: string;
  /** DiffInfo for the floor; the orchestrator derives the STDIN diff string from fileDiffs. */
  diff: DiffInfo;
  commitMessage?: string;
  /** Omit for floor-only. */
  runner?: RunnerId;
  /** Default 'request-changes'. */
  blockOn?: CiBlockOn;
  /** Env used for secret-gating + passed to the spawn seam. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Injected spawn seam (agent-cli runners). Defaults to a node:child_process impl. */
  execFile?: ExecFileLike;
  /** Injected endpoint call (the `local` runner). No real provider is imported in core. */
  localInvoke?: LocalEndpointInvoke;
}

export interface CiReviewResult {
  verdict: CiReviewVerdict;
  exitCode: number;
  terminalOutput: string;
  /** Populated when the LLM tier did not run; undefined when it ran. */
  llmSkipReason?: string;
  ranLlmTier: boolean;
}

// Silence unused-import lint until Task 2/3 wire these.
void nodeExecFile;
