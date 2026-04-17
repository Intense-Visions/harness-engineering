import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import type { AgentConfigFinding, AgentConfigSeverity } from './types';

/** Default timeout for the agnix binary. */
export const DEFAULT_AGNIX_TIMEOUT_MS = 30_000;

/** Environment variable that forces the fallback path even when agnix is installed. */
export const HARNESS_AGNIX_DISABLE = 'HARNESS_AGNIX_DISABLE';

/** Environment variable that points at an explicit agnix binary. */
export const HARNESS_AGNIX_BIN = 'HARNESS_AGNIX_BIN';

/** Outcome of a single agnix invocation. */
export type AgnixOutcome =
  | { kind: 'ok'; code: 0 | 1; stdout: string }
  | { kind: 'timeout' }
  | { kind: 'spawn-error'; stderr: string }
  | { kind: 'tool-failure'; code: number; stderr: string };

/**
 * Resolve the agnix binary path.
 *
 * Precedence: explicit argument → `HARNESS_AGNIX_BIN` env var → PATH lookup (`agnix` / `agnix.exe`).
 * Returns `null` when no executable is discoverable.
 */
export function resolveAgnixBinary(explicit?: string): string | null {
  if (explicit) return existsSync(explicit) ? explicit : null;
  const fromEnv = process.env[HARNESS_AGNIX_BIN];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return lookupOnPath();
}

function lookupOnPath(): string | null {
  const pathEnv = process.env.PATH ?? process.env.Path ?? '';
  if (!pathEnv) return null;
  const sep = process.platform === 'win32' ? ';' : ':';
  const candidates = process.platform === 'win32' ? ['agnix.exe', 'agnix.cmd', 'agnix'] : ['agnix'];
  for (const dir of pathEnv.split(sep)) {
    const hit = firstExistingIn(dir, candidates);
    if (hit) return hit;
  }
  return null;
}

function firstExistingIn(dir: string, candidates: string[]): string | null {
  if (!dir) return null;
  for (const name of candidates) {
    const candidate = isAbsolute(dir) ? join(dir, name) : join(process.cwd(), dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** `true` when the user has explicitly disabled the agnix path via environment variable. */
export function isAgnixDisabled(): boolean {
  const v = process.env[HARNESS_AGNIX_DISABLE];
  return v === '1' || v === 'true';
}

/**
 * Run the agnix binary and collect its JSON output.
 *
 * Resolves with `AgnixOutcome` rather than throwing so the orchestrator can decide whether
 * to fall back without catching exceptions in a hot path.
 */
export function runAgnix(
  cwd: string,
  strict: boolean,
  binPath: string,
  timeoutMs: number = DEFAULT_AGNIX_TIMEOUT_MS,
  spawnFn: typeof spawn = spawn
): Promise<AgnixOutcome> {
  return new Promise<AgnixOutcome>((resolve) => {
    const args = ['--format', 'json'];
    if (strict) args.push('--strict');
    args.push(cwd);

    const options: SpawnOptions = { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] };
    const child = spawnFn(binPath, args, options);

    let stdout = '';
    let stderr = '';
    let settled = false;
    let didError = false;

    const settle = (outcome: AgnixOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle({ kind: 'timeout' });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    // Record errors, but wait for `close` before resolving so stderr has a chance to flush
    // and we consistently categorize spawn-error vs tool-failure across platforms.
    child.on('error', () => {
      didError = true;
    });
    child.on('close', (code) => {
      if (didError) {
        settle({ kind: 'spawn-error', stderr });
        return;
      }
      if (code === 0 || code === 1) {
        settle({ kind: 'ok', code, stdout });
      } else {
        settle({ kind: 'tool-failure', code: code ?? -1, stderr });
      }
    });
  });
}

/**
 * Raw agnix diagnostic shape.
 *
 * The agnix project emits a JSON array of diagnostics when invoked with `--format json`.
 * We are permissive about field presence because the format is evolving.
 */
interface AgnixDiagnostic {
  file?: string;
  path?: string;
  line?: number;
  column?: number;
  rule?: string;
  rule_id?: string;
  severity?: string;
  level?: string;
  message?: string;
  suggestion?: string;
  fix?: string;
}

/**
 * Parse agnix JSON output into normalized findings.
 *
 * Returns `null` when the payload cannot be parsed as either an array or an object
 * containing a `diagnostics` array — callers should treat `null` as a `tool-parse-error`.
 */
export function parseAgnixOutput(stdout: string, cwd: string): AgentConfigFinding[] | null {
  const trimmed = stdout.trim();
  if (trimmed === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const diagnostics = extractDiagnostics(parsed);
  if (diagnostics === null) return null;

  return diagnostics.map((diag) => normalizeDiagnostic(diag, cwd));
}

function extractDiagnostics(parsed: unknown): AgnixDiagnostic[] | null {
  if (Array.isArray(parsed)) return parsed as AgnixDiagnostic[];
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.diagnostics)) return obj.diagnostics as AgnixDiagnostic[];
    if (Array.isArray(obj.findings)) return obj.findings as AgnixDiagnostic[];
    if (Array.isArray(obj.results)) return obj.results as AgnixDiagnostic[];
  }
  return null;
}

function normalizeDiagnostic(diag: AgnixDiagnostic, cwd: string): AgentConfigFinding {
  const finding: AgentConfigFinding = {
    file: normalizeFilePath(readFile(diag), cwd),
    ruleId: readRuleId(diag),
    severity: normalizeSeverity(readSeverity(diag)),
    message: diag.message ?? 'agnix diagnostic',
  };
  attachOptionalFields(finding, diag);
  return finding;
}

function readFile(diag: AgnixDiagnostic): string {
  return diag.file ?? diag.path ?? '';
}

function readRuleId(diag: AgnixDiagnostic): string {
  return diag.rule_id ?? diag.rule ?? 'AGNIX-UNKNOWN';
}

function readSeverity(diag: AgnixDiagnostic): string | undefined {
  return diag.severity ?? diag.level;
}

function attachOptionalFields(finding: AgentConfigFinding, diag: AgnixDiagnostic): void {
  if (typeof diag.line === 'number') finding.line = diag.line;
  if (typeof diag.column === 'number') finding.column = diag.column;
  const suggestion = diag.suggestion ?? diag.fix;
  if (suggestion) finding.suggestion = suggestion;
}

function normalizeFilePath(rawFile: string, cwd: string): string {
  if (!rawFile) return '(unknown)';
  return rawFile.startsWith(cwd) ? rawFile.slice(cwd.length).replace(/^[\\/]+/, '') : rawFile;
}

function normalizeSeverity(raw: string | undefined): AgentConfigSeverity {
  if (!raw) return 'warning';
  const lowered = raw.toLowerCase();
  if (lowered === 'error' || lowered === 'fatal' || lowered === 'critical') return 'error';
  if (lowered === 'info' || lowered === 'note' || lowered === 'hint') return 'info';
  return 'warning';
}
