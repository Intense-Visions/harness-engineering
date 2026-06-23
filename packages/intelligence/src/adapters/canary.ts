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

// canary review-test <path> --json → array
export const canaryFindingSchema = z.object({
  file: z.string(),
  line: z.number(),
  rule: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
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

/** Default exec seam: `execFile` with an explicit trailing callback. */
const defaultExec: CanaryExec = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'utf8' }, (err: Error | null, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ stdout: stdout as string });
    });
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

export function createCanaryAdapter(exec: CanaryExec = defaultExec): CanaryAdapter {
  /**
   * Run a canary subcommand. Never throws — classifies failure into a degrade reason:
   *  - `not-installed`  spawn failed (ENOENT): the launcher/package isn't on PATH.
   *  - `binary-missing` launcher ran but exited 1 with "canary binary not found"
   *                     (postinstall skipped / offline / unsupported platform).
   *  - `exec-failed`    any other non-zero exit.
   */
  async function execCanary(subArgs: string[]): Promise<ExecOk | ExecErr> {
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

  let cachedProbe: Promise<CanaryProbe> | undefined;

  const probe = (): Promise<CanaryProbe> =>
    (cachedProbe ??= (async (): Promise<CanaryProbe> => {
      const res = await execCanary(['version']);
      if (!res.ok) return { status: 'degraded', reason: res.reason };
      // Zero exit but no usable output — the CLI ran but told us nothing.
      if (res.stdout.trim() === '') return { status: 'degraded', reason: 'bad-output' };
      // Omit `version` entirely when unparseable (exactOptionalPropertyTypes).
      const version = parseVersion(res.stdout);
      return version ? { status: 'available', version } : { status: 'available' };
    })());

  // recommendFramework + reviewTest land in Tasks 4 & 5 (after the probe checkpoint).
  // The cast is a deliberate, temporary intermediate; it is removed in Task 5 once
  // all three methods are present and the object satisfies CanaryAdapter structurally.
  return { probe } as CanaryAdapter;
}
