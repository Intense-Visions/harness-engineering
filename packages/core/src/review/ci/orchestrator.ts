import { execFile as nodeExecFile } from 'node:child_process';
import type { DiffInfo } from '../types/context';
import type { ReviewFinding } from '../types';
import type { CiReviewVerdict } from './verdict-schema';
import type { RunnerId, LocalEndpointInvoke } from './runner-presets';
import { RUNNER_PRESETS } from './runner-presets';
import { CI_ASSESSMENTS, buildCiReviewVerdict } from './verdict-schema';
import { runReviewPipeline } from '../pipeline-orchestrator';

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

/** Default spawn seam: pipes `stdin` to the child and resolves with stdout. */
const defaultExecFile: ExecFileLike = async (command, args, opts) => {
  const child = nodeExecFile(command, args, {
    env: opts.env,
    maxBuffer: 1024 * 1024 * 64,
  });
  child.stdin?.end(opts.stdin);
  const stdout = await new Promise<string>((resolve, reject) => {
    let out = '';
    child.stdout?.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`exited with code ${code}`))
    );
  });
  return { stdout };
};

/** Render the unified-diff string the LLM tier reads from STDIN. */
function diffToStdin(diff: DiffInfo): string {
  return Array.from(diff.fileDiffs.values()).join('\n');
}

/** Derive the assessment implied by a finding set (mirrors buildCiReviewVerdict's severity logic). */
function deriveAssessment(
  findings: ReadonlyArray<{ severity: string }>
): CiReviewVerdict['assessment'] {
  if (findings.some((f) => f.severity === 'critical')) return 'request-changes';
  if (findings.some((f) => f.severity === 'important')) return 'comment';
  return 'approve';
}

/** Take the more severe of two assessments (CI_ASSESSMENTS index order is severity order). */
function maxAssessment(
  a: CiReviewVerdict['assessment'],
  b: CiReviewVerdict['assessment']
): CiReviewVerdict['assessment'] {
  return CI_ASSESSMENTS.indexOf(a) >= CI_ASSESSMENTS.indexOf(b) ? a : b;
}

export async function runCiReview(options: RunCiReviewOptions): Promise<CiReviewResult> {
  const { projectRoot, diff, commitMessage = '', runner, blockOn = 'request-changes' } = options;

  // --- FLOOR ---
  const floor = await runReviewPipeline({
    projectRoot,
    diff,
    commitMessage,
    flags: { ci: true, comment: false, deep: false, noMechanical: false },
  });
  const floorFindings: ReviewFinding[] = floor.findings;
  // Keep assessment consistent with findings so buildCiReviewVerdict's superRefine accepts it.
  const floorAssessment = maxAssessment(
    floor.assessment ?? 'approve',
    deriveAssessment(floorFindings)
  );

  // SHORT-CIRCUIT: mechanical stop never spends LLM tokens (matches pipeline Phase-2 stop).
  if (floor.stoppedByMechanical) {
    const shortCircuitReason = 'LLM tier skipped — floor mechanical-stop (short-circuit)';
    const verdict = buildCiReviewVerdict({
      runner: 'floor-only',
      ranLlmTier: false,
      assessment: floorAssessment,
      findings: floorFindings,
      skipped: false,
      skipReason: shortCircuitReason,
    });
    return {
      verdict,
      exitCode: applyThreshold(verdict, blockOn, false),
      terminalOutput: summarize(verdict),
      llmSkipReason: shortCircuitReason,
      ranLlmTier: false,
    };
  }

  // --- LLM TIER (secret-gated; injected seams; graceful skip) ---
  const env = options.env ?? process.env;
  const execFile = options.execFile ?? defaultExecFile;

  // verdictParser output findings (the schema-validated shape, which differs from the
  // core ReviewFinding type only by optional-property variance under exactOptionalPropertyTypes).
  let llmFindings: CiReviewVerdict['findings'] = [];
  let ranLlmTier = false;
  let requiredRunnerFailed = false;
  let llmSkipReason: string | undefined;

  if (runner) {
    const preset = RUNNER_PRESETS[runner];
    if (preset.supported !== true) {
      llmSkipReason = `LLM tier skipped — runner '${runner}' is unsupported`;
    } else if (preset.kind === 'agent-cli') {
      if (!env[preset.secretEnvVar]) {
        llmSkipReason = `LLM tier skipped — secret ${preset.secretEnvVar} not set (floor-only)`;
      } else {
        try {
          const instruction =
            'Run the harness code-review skill on the unified diff piped via STDIN. ' +
            'Emit ONLY the CiReviewVerdict JSON ({assessment, findings}).';
          const { command, args } = preset.headlessInvocation({ instruction });
          const { stdout } = await execFile(command, args, {
            stdin: diffToStdin(diff),
            env,
          });
          llmFindings = preset.verdictParser(stdout).findings;
          ranLlmTier = true;
        } catch (err) {
          requiredRunnerFailed = true;
          llmSkipReason = `LLM tier failed — ${(err as Error).message}`;
        }
      }
    } else {
      // endpoint runner ('local')
      const invoke = options.localInvoke ?? preset.invoke;
      const endpoint = env[preset.endpointEnvVar];
      const model = env[preset.modelEnvVar];
      if (!invoke || !endpoint || !model) {
        llmSkipReason =
          'LLM tier skipped — local endpoint not configured (no invoke seam or missing endpoint/model env)';
      } else {
        try {
          const instruction =
            'Review the unified diff and emit ONLY the CiReviewVerdict JSON ({assessment, findings}).';
          const raw = await invoke({ endpoint, model, instruction, diff: diffToStdin(diff) });
          llmFindings = preset.verdictParser(raw).findings;
          ranLlmTier = true;
        } catch (err) {
          requiredRunnerFailed = true;
          llmSkipReason = `LLM tier failed — ${(err as Error).message}`;
        }
      }
    }
  }

  // --- MERGE --- floor + LLM findings into one verdict (Phase 1 invariants enforced).
  const mergedFindings = [...floorFindings, ...llmFindings];
  const mergedAssessment = maxAssessment(floorAssessment, deriveAssessment(mergedFindings));
  const verdict = buildCiReviewVerdict({
    runner: ranLlmTier ? (runner as RunnerId) : 'floor-only',
    ranLlmTier,
    assessment: mergedAssessment,
    findings: mergedFindings,
    ...(llmSkipReason ? { skipReason: llmSkipReason } : {}),
  });

  return {
    verdict,
    exitCode: applyThreshold(verdict, blockOn, requiredRunnerFailed),
    terminalOutput: summarize(verdict),
    ...(llmSkipReason ? { llmSkipReason } : {}),
    ranLlmTier,
  };
}

// --- threshold + summary stubs (fleshed out in Task 4) ---
function applyThreshold(
  v: CiReviewVerdict,
  _blockOn: CiBlockOn,
  _requiredRunnerFailed: boolean
): number {
  return v.exitCode;
}
function summarize(v: CiReviewVerdict): string {
  return `runner=${v.runner} ran-llm=${v.ranLlmTier} assessment=${v.assessment} exit=${v.exitCode}`;
}
