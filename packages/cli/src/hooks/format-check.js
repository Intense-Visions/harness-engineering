// format-check.js — shared detection core for the format/lint hooks.
//
// Single source of truth for formatter detection and execution, imported by
// both `quality-warner.js` (warn-only) and `strict-quality-gate.js` (blocking).
// Takes NO opinion on exit codes — it returns a structured result and lets each
// entrypoint decide what to do with it.
//
// Result shape:
//   { status: 'clean' | 'violations' | 'infra-error', name, output, message,
//     reason? }
//
// `reason` is set on every `infra-error` result:
//   'not-installed' — the binary could not be spawned (ENOENT);
//   'timeout'       — the tool was killed by our spawn timeout, so there is NO
//                     verdict (it may well have found violations, #2337);
//   'failed'        — it ran but produced nothing parseable as violations.
// Callers that must not report a pass without a verdict (the strict gate)
// branch on `reason === 'timeout'`.
//
// The spawn timeout defaults per tool and can be overridden with the
// HARNESS_FORMAT_CHECK_TIMEOUT_MS env var (positive integer, milliseconds).
//
// Disambiguation contract (load-bearing): `violations` (the formatter spawned
// and reported real format/lint problems) MUST be distinguishable from
// `infra-error` (the tool is absent, timed out, or could not run). The strict
// gate blocks on `violations` and on an `infra-error` whose reason is
// 'timeout' (no verdict); every other ambiguous outcome defaults to
// `infra-error` so the gate fails open rather than walling off every edit.

import { accessSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

// Detection order: first match wins
const DETECTORS = [
  {
    configs: ['biome.json', 'biome.jsonc'],
    cmd: 'npx',
    args: ['biome', 'check'],
    name: 'Biome',
  },
  {
    configs: [
      '.prettierrc',
      '.prettierrc.json',
      '.prettierrc.yml',
      '.prettierrc.yaml',
      '.prettierrc.js',
      '.prettierrc.cjs',
      '.prettierrc.mjs',
      'prettier.config.js',
      'prettier.config.cjs',
      'prettier.config.mjs',
    ],
    cmd: 'npx',
    args: ['prettier', '--check'],
    name: 'Prettier',
  },
  {
    configs: ['.ruff.toml', 'ruff.toml'],
    cmd: 'ruff',
    args: ['check'],
    name: 'Ruff',
  },
];

export function detectFormatter(cwd) {
  for (const detector of DETECTORS) {
    for (const config of detector.configs) {
      try {
        accessSync(join(cwd, config));
        return detector;
      } catch {
        // Config not found, try next
      }
    }
  }
  return null;
}

/** Spawn timeout: HARNESS_FORMAT_CHECK_TIMEOUT_MS when valid, else `fallbackMs`. */
function spawnTimeout(fallbackMs) {
  const override = Number.parseInt(process.env.HARNESS_FORMAT_CHECK_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(override) && override > 0 ? override : fallbackMs;
}

/** Why a spawn produced no verdict: 'not-installed' | 'timeout' | 'failed'. */
function infraReason(err) {
  if (err?.code === 'ENOENT') return 'not-installed';
  // execFileSync's timeout kills the child with a signal and sets ETIMEDOUT.
  if (err?.code === 'ETIMEDOUT' || err?.signal) return 'timeout';
  return 'failed';
}

/** Concatenate whatever a failed execFileSync left on stdout/stderr. */
function errorOutput(err) {
  return `${err?.stdout ?? ''}${err?.stderr ?? ''}`;
}

/**
 * Classify a non-zero formatter exit as a real `violations` result or an
 * `infra-error`. The detector's exit code alone is ambiguous (linters exit
 * non-zero both for genuine violations and for usage/spawn failures), so we
 * default to `infra-error` (fail open) unless we can positively identify
 * parseable violation output.
 */
function classifyError(err) {
  // The command binary itself is missing / not spawnable.
  if (err?.code === 'ENOENT') return 'infra-error';
  // Killed by a signal — almost always our own timeout.
  if (err?.signal) return 'infra-error';

  const output = errorOutput(err);

  // npx/npm could not locate or run the underlying tool, or the tool was
  // invoked without a target it requires (e.g. `prettier --check` with no
  // file). These are usage/infra failures, NOT format violations.
  if (
    /could not determine executable|npm error|command not found|not found|ENOENT|expected at least one|no files matching|usage:/i.test(
      output
    )
  ) {
    return 'infra-error';
  }

  // Spawned, exited non-zero, and produced parseable output → real violations.
  if (typeof err?.status === 'number' && output.trim()) return 'violations';

  // Non-zero but nothing to parse — treat as infra and fail open.
  return 'infra-error';
}

/**
 * Run the project's formatter/linter for the edited file and classify the
 * outcome. Performs detection only — never calls process.exit.
 *
 * @param {{ tool_input?: { file_path?: string } }} input  Parsed hook stdin.
 * @param {string} cwd                                      Project root.
 * @returns {{ status: 'clean'|'violations'|'infra-error', name: string|null, output: string, message: string }}
 */
export function runFormatCheck(input, cwd) {
  const filePath = input?.tool_input?.file_path ?? '';

  // Special case: .go files use `gofmt -l`, which lists files needing formatting.
  if (typeof filePath === 'string' && filePath.endsWith('.go')) {
    try {
      const result = execFileSync('gofmt', ['-l', filePath], {
        encoding: 'utf-8',
        cwd,
        timeout: spawnTimeout(10000),
      });
      if (result.trim()) {
        return {
          status: 'violations',
          name: 'gofmt',
          output: result.trim(),
          message: `gofmt found formatting issues in: ${result.trim()}`,
        };
      }
      return { status: 'clean', name: 'gofmt', output: '', message: 'gofmt check passed' };
    } catch (err) {
      // gofmt not available, timed out, or failed to run — no verdict.
      const reason = infraReason(err);
      return {
        status: 'infra-error',
        reason,
        name: 'gofmt',
        output: errorOutput(err),
        message:
          reason === 'timeout'
            ? 'gofmt check timed out before reporting a verdict'
            : 'gofmt check failed (tool may not be installed)',
      };
    }
  }

  const detector = detectFormatter(cwd);
  if (!detector) {
    // No formatter detected — nothing to check.
    return { status: 'clean', name: null, output: '', message: 'No formatter detected' };
  }

  try {
    execFileSync(detector.cmd, detector.args, {
      encoding: 'utf-8',
      cwd,
      timeout: spawnTimeout(30000),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {
      status: 'clean',
      name: detector.name,
      output: '',
      message: `${detector.name} check passed`,
    };
  } catch (err) {
    const output = errorOutput(err).slice(0, 500);
    if (classifyError(err) === 'violations') {
      return {
        status: 'violations',
        name: detector.name,
        output,
        message: `${detector.name} check reported issues:\n${output}`,
      };
    }
    const reason = infraReason(err);
    return {
      status: 'infra-error',
      reason,
      name: detector.name,
      output,
      message:
        reason === 'timeout'
          ? `${detector.name} check timed out before reporting a verdict`
          : `${detector.name} check could not run (treated as non-blocking):\n${output}`,
    };
  }
}

/**
 * Parse hook stdin (the JSON event payload) already read by the caller via
 * read-hook-stdin.js. Returns null when it is empty or malformed so callers can
 * fail open on a legitimately empty payload.
 *
 * @param {string} raw
 */
export function parseHookInput(raw) {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
