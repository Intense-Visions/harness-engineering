import { execFile as nodeExecFile } from 'node:child_process';
import type { DiffInfo } from '../types/context';
import type { ReviewFinding } from '../types';
import type { CiReviewVerdict } from './verdict-schema';
import type {
  RunnerId,
  LocalEndpointInvoke,
  AgentCliPreset,
  EndpointPreset,
} from './runner-presets';
import { RUNNER_PRESETS } from './runner-presets';
import { CI_ASSESSMENTS, buildCiReviewVerdict } from './verdict-schema';
import { runReviewPipeline } from '../pipeline-orchestrator';

/** block-on threshold: an assessment level, or 'none' to never block on assessment. */
export type CiBlockOn = (typeof CI_ASSESSMENTS)[number] | 'none';

/** Default child-process timeout (ms). A hung CLI (e.g. interactive-auth fallthrough)
 * must not make runCiReview hang forever — that would defeat the
 * requiredRunnerFailed→exit 1 guarantee. On timeout the child is SIGTERM-killed. */
export const DEFAULT_EXEC_TIMEOUT_MS = 120_000;
/** Default cap on captured stdout bytes. Exceeding it kills the child and rejects
 * (classified as a runner failure, never a silent pass). */
export const DEFAULT_EXEC_MAX_STDOUT_BYTES = 1024 * 1024 * 64;
/** Cap on captured stderr bytes (kept only for the rejection-message tail). */
const STDERR_CAP_BYTES = 1024 * 1024;
/** Bytes of stderr surfaced in a rejection Error for debuggability. */
const STDERR_TAIL_BYTES = 2048;

/**
 * Injected process-spawn seam. Defaults to a node:child_process-backed impl in
 * runCiReview; unit tests pass a mock so NO real CLI is ever spawned. Returns the
 * child's captured stdout. `stdin` is the unified diff piped to the process.
 * `timeoutMs`/`maxStdoutBytes` are honored by the default impl; mock seams may ignore them.
 */
export type ExecFileLike = (
  command: string,
  args: string[],
  opts: { stdin: string; env: NodeJS.ProcessEnv; timeoutMs?: number; maxStdoutBytes?: number }
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
  /** Hard timeout (ms) for a spawned runner CLI. Default DEFAULT_EXEC_TIMEOUT_MS. */
  execTimeoutMs?: number;
  /** Max captured stdout bytes before the runner is killed + failed. Default DEFAULT_EXEC_MAX_STDOUT_BYTES. */
  execMaxStdoutBytes?: number;
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

/**
 * Default spawn seam: pipes `stdin` to the child and resolves with stdout.
 *
 * Child-process safety (all hazards live ONLY here — mock seams in tests never
 * spawn a real process, so these guards are exercised by the SUG-4 tests against
 * a stub `node -e` binary):
 *  - timeout: kills a hung CLI with SIGTERM so runCiReview can never block forever.
 *    On kill, `close` fires with code===null which we reject → requiredRunnerFailed.
 *  - stdout cap: execFile's `maxBuffer` does NOT apply in streaming/spawn mode, so
 *    we enforce the cap MANUALLY by tracking accumulated byte length and killing +
 *    rejecting on overflow (a runner failure, never a silent green pass).
 *  - stderr: captured (bounded) and a tail surfaced in the rejection message so a
 *    blocked CI run is debuggable from llmSkipReason.
 */
export const defaultExecFile: ExecFileLike = async (command, args, opts) => {
  const timeout = opts.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
  const maxStdoutBytes = opts.maxStdoutBytes ?? DEFAULT_EXEC_MAX_STDOUT_BYTES;
  const child = nodeExecFile(command, args, {
    env: opts.env,
    timeout,
    killSignal: 'SIGTERM',
  });
  child.stdin?.end(opts.stdin);

  return new Promise<{ stdout: string }>((resolve, reject) => {
    let out = '';
    let outBytes = 0;
    let err = '';
    let errBytes = 0;
    let overflowed = false;

    child.stdout?.on('data', (d: Buffer | string) => {
      const chunk = Buffer.isBuffer(d) ? d : Buffer.from(String(d));
      outBytes += chunk.length;
      out += chunk.toString();
      if (!overflowed && outBytes > maxStdoutBytes) {
        overflowed = true;
        child.kill('SIGTERM');
        reject(new Error(`runner output exceeded ${maxStdoutBytes} bytes`));
      }
    });
    // Bound stderr too so a chatty/looping CLI can't blow memory; keep only the tail.
    child.stderr?.on('data', (d: Buffer | string) => {
      const chunk = Buffer.isBuffer(d) ? d : Buffer.from(String(d));
      errBytes += chunk.length;
      err += chunk.toString();
      if (errBytes > STDERR_CAP_BYTES) err = err.slice(-STDERR_CAP_BYTES);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (overflowed) return; // already rejected on overflow
      if (code === 0) {
        resolve({ stdout: out });
        return;
      }
      // code===null means the child was killed (e.g. timeout SIGTERM) — reject so it
      // is classified as requiredRunnerFailed, never a silent pass.
      const tail = err.length > 0 ? ` — stderr: ${err.slice(-STDERR_TAIL_BYTES)}` : '';
      reject(new Error(`exited with code ${code}${tail}`));
    });
  });
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

/**
 * Build a floor-only early-return result (no LLM tier). Shared by the skipped-floor
 * and mechanical-stop short-circuits. `requiredRunnerFailed` forces exit 1 even on a
 * 'request-changes'-or-lower assessment under blockOn 'none'.
 */
function floorOnlyResult(args: {
  assessment: CiReviewVerdict['assessment'];
  findings: ReviewFinding[];
  skipped: boolean;
  skipReason: string;
  blockOn: CiBlockOn;
  requiredRunnerFailed: boolean;
}): CiReviewResult {
  const verdict = buildCiReviewVerdict({
    runner: 'floor-only',
    ranLlmTier: false,
    assessment: args.assessment,
    findings: args.findings,
    skipped: args.skipped,
    skipReason: args.skipReason,
  });
  return {
    verdict,
    exitCode: applyThreshold(verdict, args.blockOn, args.requiredRunnerFailed),
    terminalOutput: summarize(verdict),
    llmSkipReason: args.skipReason,
    ranLlmTier: false,
  };
}

/** Outcome of the (optional) LLM tier: parsed findings + execution status. */
interface LlmTierResult {
  findings: CiReviewVerdict['findings'];
  ranLlmTier: boolean;
  /** A required runner was configured but failed to execute → forces exit 1. */
  requiredRunnerFailed: boolean;
  skipReason?: string;
}

const EMPTY_TIER: LlmTierResult = { findings: [], ranLlmTier: false, requiredRunnerFailed: false };

interface LlmTierContext {
  diff: DiffInfo;
  env: NodeJS.ProcessEnv;
  execFile: ExecFileLike;
  options: RunCiReviewOptions;
}

/** Run an agent-cli runner via the spawn seam. Throws on execution/parse failure. */
async function runAgentCliRunner(
  preset: Extract<AgentCliPreset, { supported: true }>,
  ctx: LlmTierContext
): Promise<CiReviewVerdict['findings']> {
  const instruction =
    'Run the harness code-review skill on the unified diff piped via STDIN. ' +
    'Emit ONLY the CiReviewVerdict JSON ({assessment, findings}).';
  const { command, args } = preset.headlessInvocation({ instruction });
  const { stdout } = await ctx.execFile(command, args, {
    stdin: diffToStdin(ctx.diff),
    env: ctx.env,
    timeoutMs: ctx.options.execTimeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
    maxStdoutBytes: ctx.options.execMaxStdoutBytes ?? DEFAULT_EXEC_MAX_STDOUT_BYTES,
  });
  return preset.verdictParser(stdout).findings;
}

/** Run the endpoint ('local') runner via the injected invoke seam. Throws on failure. */
async function runEndpointRunner(
  preset: Extract<EndpointPreset, { supported: true }>,
  endpoint: string,
  model: string,
  invoke: NonNullable<LocalEndpointInvoke>,
  ctx: LlmTierContext
): Promise<CiReviewVerdict['findings']> {
  const instruction =
    'Review the unified diff and emit ONLY the CiReviewVerdict JSON ({assessment, findings}).';
  const raw = await invoke({ endpoint, model, instruction, diff: diffToStdin(ctx.diff) });
  return preset.verdictParser(raw).findings;
}

/**
 * Resolve the LLM tier for a configured runner: unsupported/unconfigured runners
 * skip gracefully (no failure); a configured runner that throws is classified as
 * requiredRunnerFailed so its error blocks the gate (never a silent pass).
 */
async function runLlmTier(runner: RunnerId, ctx: LlmTierContext): Promise<LlmTierResult> {
  const preset = RUNNER_PRESETS[runner];
  if (preset.supported !== true) {
    return { ...EMPTY_TIER, skipReason: `LLM tier skipped — runner '${runner}' is unsupported` };
  }

  if (preset.kind === 'agent-cli') {
    if (!ctx.env[preset.secretEnvVar]) {
      return {
        ...EMPTY_TIER,
        skipReason: `LLM tier skipped — secret ${preset.secretEnvVar} not set (floor-only)`,
      };
    }
    try {
      return {
        findings: await runAgentCliRunner(preset, ctx),
        ranLlmTier: true,
        requiredRunnerFailed: false,
      };
    } catch (err) {
      return {
        ...EMPTY_TIER,
        requiredRunnerFailed: true,
        skipReason: `LLM tier failed — ${(err as Error).message}`,
      };
    }
  }

  // endpoint runner ('local')
  const invoke = ctx.options.localInvoke ?? preset.invoke;
  const endpoint = ctx.env[preset.endpointEnvVar];
  const model = ctx.env[preset.modelEnvVar];
  if (!invoke || !endpoint || !model) {
    return {
      ...EMPTY_TIER,
      skipReason:
        'LLM tier skipped — local endpoint not configured (no invoke seam or missing endpoint/model env)',
    };
  }
  try {
    return {
      findings: await runEndpointRunner(preset, endpoint, model, invoke, ctx),
      ranLlmTier: true,
      requiredRunnerFailed: false,
    };
  } catch (err) {
    return {
      ...EMPTY_TIER,
      requiredRunnerFailed: true,
      skipReason: `LLM tier failed — ${(err as Error).message}`,
    };
  }
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
  // SUG-5: a `skipped` floor (PR-eligibility gate declined to run, when a future
  // caller wires prMetadata) returns exitCode 0 with no findings. Treating that as a
  // clean floor would silently turn a not-run review into a green gate. The CI
  // orchestrator owns no eligibility semantics, so it must NOT swallow a skip: fail
  // closed (requiredRunnerFailed=true) so a skip blocks the gate.
  if (floor.skipped) {
    return floorOnlyResult({
      assessment: 'request-changes',
      findings: [],
      skipped: true,
      skipReason: `floor review skipped — ${floor.skipReason ?? 'ineligible'} (CI fails closed)`,
      blockOn,
      requiredRunnerFailed: true,
    });
  }

  const floorFindings: ReviewFinding[] = floor.findings;
  // SUG-6: re-derive the floor assessment from its own findings and take the more
  // severe of (reported, derived). This defends buildCiReviewVerdict's superRefine,
  // which rejects a verdict whose assessment is inconsistent with (undefined/stale
  // against) its findings — e.g. a floor that reports 'approve' but carries a critical.
  const floorAssessment = maxAssessment(
    floor.assessment ?? 'approve',
    deriveAssessment(floorFindings)
  );

  // SHORT-CIRCUIT: mechanical stop never spends LLM tokens (matches pipeline Phase-2 stop).
  if (floor.stoppedByMechanical) {
    return floorOnlyResult({
      assessment: floorAssessment,
      findings: floorFindings,
      skipped: false,
      skipReason: 'LLM tier skipped — floor mechanical-stop (short-circuit)',
      blockOn,
      requiredRunnerFailed: false,
    });
  }

  // --- LLM TIER (secret-gated; injected seams; graceful skip) ---
  const env = options.env ?? process.env;
  const execFile = options.execFile ?? defaultExecFile;

  const tier = runner ? await runLlmTier(runner, { diff, env, execFile, options }) : EMPTY_TIER;
  const {
    findings: llmFindings,
    ranLlmTier,
    requiredRunnerFailed,
    skipReason: llmSkipReason,
  } = tier;

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

/**
 * Final exit code. Non-zero iff:
 *  - the verdict assessment meets/exceeds blockOn (assessment gate), OR
 *  - a runner was explicitly required but its LLM tier failed to execute.
 * blockOn 'none' disables the assessment gate, but a required-runner execution
 * FAILURE still blocks (a required review that errored is not a green check).
 */
function applyThreshold(
  v: CiReviewVerdict,
  blockOn: CiBlockOn,
  requiredRunnerFailed: boolean
): number {
  if (requiredRunnerFailed) return 1;
  if (blockOn === 'none') return 0;
  const rank = (a: string): number => CI_ASSESSMENTS.indexOf(a as CiReviewVerdict['assessment']);
  return rank(v.assessment) >= rank(blockOn) ? 1 : 0;
}

function summarize(v: CiReviewVerdict): string {
  const lines = [
    `runner: ${v.runner}`,
    `ranLlmTier: ${v.ranLlmTier}`,
    `assessment: ${v.assessment}`,
    `findings: ${v.findings.length} (blocking: ${v.blockingFindings.length})`,
    `exitCode: ${v.exitCode}`,
  ];
  if (v.skipReason) lines.push(`note: ${v.skipReason}`);
  return lines.join('\n');
}
