import { z } from 'zod';

/**
 * Canary adapter — a total, gracefully-degrading boundary around the deterministic
 * `canary` test CLI (`canary-test-cli`, declared as an optionalDependency).
 *
 * All `canary` / `canary-test-cli` references are confined to this module
 * (enforced by a boundary test). The adapter never throws on a missing or
 * misbehaving CLI: every method resolves a degraded/empty result instead.
 */

/** Why probe() degraded. */
export type CanaryDegradeReason = 'not-installed' | 'binary-missing' | 'exec-failed' | 'bad-output';

export interface CanaryProbe {
  status: 'available' | 'degraded';
  version?: string;
  reason?: CanaryDegradeReason;
}

// canary recommend "<prompt>" --json
export const frameworkRecommendationSchema = z.object({
  status: z.string(),
  test_type: z.string(),
  framework: z.string(),
  file_extension: z.string(),
  reasoning: z.array(z.string()),
  alternatives: z.array(z.string()),
});
export type FrameworkRecommendation = z.infer<typeof frameworkRecommendationSchema>;

// canary review-test <path> --json → array.
// `severity` is kept a permissive string: the spike observed "info", but canary may
// emit other levels. A strict enum would fail the whole-array parse on a single
// unmodeled value and silently drop every finding — so we preserve the raw level.
export const canaryFindingSchema = z.object({
  file: z.string(),
  line: z.number(),
  rule: z.string(),
  severity: z.string(),
  message: z.string(),
  suggestion: z.string(),
});
export const canaryFindingsSchema = z.array(canaryFindingSchema);
export type CanaryFinding = z.infer<typeof canaryFindingSchema>;

export interface CanaryAdapter {
  probe(): Promise<CanaryProbe>;
  recommendFramework(prompt: string): Promise<FrameworkRecommendation>;
  reviewTest(path: string, framework?: string): Promise<CanaryFinding[]>;
}

import { execFile } from 'node:child_process';

/**
 * The raw exec seam: runs a `canary` subcommand and resolves its stdout, or
 * rejects with the spawn/exit error (carrying `code` and `stderr`). This is the
 * single injection point — the default talks to the real CLI; tests pass a fake.
 * Injecting here (rather than at a higher level) keeps the degrade-classification
 * in `execCanary` fully under test.
 */
export type CanaryExec = (cmd: string, args: string[]) => Promise<{ stdout: string }>;

/** Bound exec time so a hung CLI degrades instead of blocking the caller forever. */
const EXEC_TIMEOUT_MS = 30_000;
/** Allow large `review-test` output (default execFile maxBuffer is only 1 MB). */
const EXEC_MAX_BUFFER = 16 * 1024 * 1024;

/** Default exec seam: `execFile` with an explicit trailing callback. */
const defaultExec: CanaryExec = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { encoding: 'utf8', timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER },
      (err: Error | null, stdout) => {
        if (err) {
          // A timeout kill surfaces here as an error → classified exec-failed upstream.
          reject(err);
          return;
        }
        resolve({ stdout: stdout as string });
      }
    );
  });

interface ExecOk {
  ok: true;
  stdout: string;
}
interface ExecErr {
  ok: false;
  reason: CanaryDegradeReason;
}

/**
 * Single source of truth for how the deterministic CLI is invoked. Keeps the
 * `canary` bin reference confined to this module (enforced by the boundary test).
 */
function canaryInvocation(subArgs: string[]): [string, string[]] {
  return ['canary', subArgs];
}

/** Best-effort semver extraction from `canary version` output. */
function parseVersion(stdout: string): string | undefined {
  return stdout.match(/\d+\.\d+\.\d+/)?.[0];
}

/** Parse JSON without throwing; `undefined` on malformed input. */
function safeJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

/**
 * Fresh degraded sentinel for recommendFramework. Returns a new object each call so
 * a caller mutating `reasoning`/`alternatives` can't corrupt a shared instance.
 */
function degradedRecommendation(): FrameworkRecommendation {
  return {
    status: 'degraded',
    test_type: '',
    framework: '',
    file_extension: '',
    reasoning: [],
    alternatives: [],
  };
}

/**
 * Run a canary subcommand. Never throws — classifies failure into a degrade reason:
 *  - `not-installed`  spawn failed (ENOENT): the launcher/package isn't on PATH.
 *  - `binary-missing` launcher ran but exited 1 with "canary binary not found"
 *                     (postinstall skipped / offline / unsupported platform).
 *  - `exec-failed`    any other non-zero exit.
 */
async function execCanary(exec: CanaryExec, subArgs: string[]): Promise<ExecOk | ExecErr> {
  const [cmd, args] = canaryInvocation(subArgs);
  try {
    const { stdout } = await exec(cmd, args);
    return { ok: true, stdout };
  } catch (err) {
    const e = err as { code?: string | number; stderr?: string };
    if (e.code === 'ENOENT') return { ok: false, reason: 'not-installed' };
    if (e.code === 1 && /canary binary not found/i.test(e.stderr ?? '')) {
      return { ok: false, reason: 'binary-missing' };
    }
    return { ok: false, reason: 'exec-failed' };
  }
}

async function probeCanary(exec: CanaryExec): Promise<CanaryProbe> {
  const res = await execCanary(exec, ['version']);
  if (!res.ok) return { status: 'degraded', reason: res.reason };
  // Zero exit but no usable output — the CLI ran but told us nothing.
  if (res.stdout.trim() === '') return { status: 'degraded', reason: 'bad-output' };
  // Omit `version` entirely when unparseable (exactOptionalPropertyTypes).
  const version = parseVersion(res.stdout);
  return version ? { status: 'available', version } : { status: 'available' };
}

async function recommendFrameworkCanary(
  exec: CanaryExec,
  prompt: string
): Promise<FrameworkRecommendation> {
  const res = await execCanary(exec, ['recommend', prompt, '--json']);
  if (!res.ok) return degradedRecommendation();
  const parsed = frameworkRecommendationSchema.safeParse(safeJson(res.stdout));
  return parsed.success ? parsed.data : degradedRecommendation();
}

async function reviewTestCanary(
  exec: CanaryExec,
  path: string,
  framework?: string
): Promise<CanaryFinding[]> {
  const args = ['review-test', path, '--json'];
  if (framework) args.push('--framework', framework);
  const res = await execCanary(exec, args);
  if (!res.ok) return [];
  const parsed = canaryFindingsSchema.safeParse(safeJson(res.stdout));
  return parsed.success ? parsed.data : [];
}

export function createCanaryAdapter(exec: CanaryExec = defaultExec): CanaryAdapter {
  let cachedProbe: Promise<CanaryProbe> | undefined;

  const probe = (): Promise<CanaryProbe> => (cachedProbe ??= probeCanary(exec));

  const recommendFramework = (prompt: string): Promise<FrameworkRecommendation> =>
    recommendFrameworkCanary(exec, prompt);

  const reviewTest = (path: string, framework?: string): Promise<CanaryFinding[]> =>
    reviewTestCanary(exec, path, framework);

  return { probe, recommendFramework, reviewTest };
}
