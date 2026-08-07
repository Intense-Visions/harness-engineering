import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import * as nodePath from 'node:path';

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

// One embedded per-test result inside a canary RunRecord. Permissive on unmodeled
// fields: `status`/`failure_category` are kept as raw strings (a strict enum would
// drop a whole record on one unseen value — same rationale as `severity` in
// canaryFindingSchema). Every field is optional + `.passthrough()` so schema drift
// (renamed/added keys) never hard-fails a whole line.
export const canaryTestResultSchema = z
  .object({
    test_name: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    suite: z.string().optional(),
    test_file: z.string().optional(),
    area: z.string().optional(),
    failure_category: z.string().optional(),
    error_text: z.string().optional(),
    retry_count: z.number().optional(),
    duration_ms: z.number().optional(),
    flaky: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();
export type CanaryTestResult = z.infer<typeof canaryTestResultSchema>;

// One RunRecord per NDJSON line in history-v2.jsonl. `tests` defaults to [] so a
// record missing the array still validates. All scalar fields optional + passthrough
// so one unmodeled/renamed field never drops the record.
export const canaryRunRecordSchema = z
  .object({
    run_id: z.string().optional(),
    suite: z.string().optional(),
    repo: z.string().optional(),
    branch: z.string().optional(),
    commit_sha: z.string().optional(),
    timestamp: z.string().optional(),
    exit_code: z.number().optional(),
    total: z.number().optional(),
    passed: z.number().optional(),
    failed: z.number().optional(),
    flaky: z.number().optional(),
    skipped: z.number().optional(),
    tests: z.array(canaryTestResultSchema).default([]),
  })
  .passthrough();
export type CanaryRunRecord = z.infer<typeof canaryRunRecordSchema>;

export interface CanaryAdapter {
  probe(): Promise<CanaryProbe>;
  recommendFramework(prompt: string): Promise<FrameworkRecommendation>;
  reviewTest(path: string, framework?: string): Promise<CanaryFinding[]>;
  readRunHistory(opts?: { cwd?: string; limit?: number }): Promise<CanaryRunRecord[]>;
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

/**
 * The raw file-read seam: resolves the utf8 contents of a path, or rejects
 * (ENOENT / EACCES). Parallels {@link CanaryExec} — the single injection point for
 * the documented-artifact acquisition path. The default reads the real file; tests
 * inject a fake. Keeping the seam here (rather than at a higher level) keeps the
 * degrade-classification in `readRunHistoryCanary` fully under test.
 */
export type CanaryReader = (filePath: string) => Promise<string>;

/**
 * Canary's documented, stable structured run-history store, relative to the project
 * root (cwd). One JSON RunRecord per line (NDJSON). Confined to this module so the
 * canary coupling stays inside the adapter boundary.
 */
const HISTORY_STORE_RELATIVE = 'test-results/reports/history-v2.jsonl';

/** Default read seam: utf8 `fs.readFile`. */
const defaultReader: CanaryReader = (filePath) => readFile(filePath, 'utf8');

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

/**
 * Read canary's documented NDJSON run-history store and return validated records.
 * Total (never throws): a missing/unreadable store degrades to `[]`, and individual
 * malformed lines are dropped while valid records survive (permissive per-line
 * `safeParse`). Records are newest-last in the file; `limit` caps to the most-recent N.
 */
async function readRunHistoryCanary(
  reader: CanaryReader,
  opts: { cwd?: string; limit?: number } = {}
): Promise<CanaryRunRecord[]> {
  const filePath = nodePath.resolve(opts.cwd ?? process.cwd(), HISTORY_STORE_RELATIVE);
  let raw: string;
  try {
    raw = await reader(filePath);
  } catch {
    return []; // missing / unreadable → degrade to []
  }
  const records: CanaryRunRecord[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue; // ignore blank lines
    const json = safeJson(trimmed); // reuse the existing non-throwing JSON parser
    if (json === undefined) continue; // drop malformed line, keep the rest
    const parsed = canaryRunRecordSchema.safeParse(json);
    if (parsed.success) records.push(parsed.data);
  }
  return typeof opts.limit === 'number' && opts.limit >= 0 ? records.slice(-opts.limit) : records;
}

export function createCanaryAdapter(
  exec: CanaryExec = defaultExec,
  reader: CanaryReader = defaultReader
): CanaryAdapter {
  let cachedProbe: Promise<CanaryProbe> | undefined;

  const probe = (): Promise<CanaryProbe> => (cachedProbe ??= probeCanary(exec));

  const recommendFramework = (prompt: string): Promise<FrameworkRecommendation> =>
    recommendFrameworkCanary(exec, prompt);

  const reviewTest = (path: string, framework?: string): Promise<CanaryFinding[]> =>
    reviewTestCanary(exec, path, framework);

  const readRunHistory = (opts?: { cwd?: string; limit?: number }): Promise<CanaryRunRecord[]> =>
    readRunHistoryCanary(reader, opts);

  return { probe, recommendFramework, reviewTest, readRunHistory };
}
