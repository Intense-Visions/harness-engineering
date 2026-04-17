import {
  DEFAULT_AGNIX_TIMEOUT_MS,
  isAgnixDisabled,
  parseAgnixOutput,
  resolveAgnixBinary,
  runAgnix,
} from './agnix-runner';
import { runFallbackRules } from './fallback';
import type {
  AgentConfigFallbackReason,
  AgentConfigFinding,
  AgentConfigOptions,
  AgentConfigValidation,
} from './types';

/**
 * Validate agent configuration files under `cwd`.
 *
 * Prefers the `agnix` binary (~385 rules). When agnix is unavailable, disabled, or fails,
 * the call falls back to a set of high-value TypeScript rules (`HARNESS-AC-*`). The shape of
 * the returned value is stable across engines so downstream consumers do not branch on engine.
 */
export async function validateAgentConfigs(
  cwd: string,
  options: AgentConfigOptions = {}
): Promise<AgentConfigValidation> {
  const strict = options.strict ?? false;
  const timeoutMs = options.agnixTimeoutMs ?? DEFAULT_AGNIX_TIMEOUT_MS;

  if (isAgnixDisabled()) {
    return fallback(cwd, strict, 'env-disabled');
  }

  const binary = resolveAgnixBinary(options.agnixBin);
  if (!binary) {
    return fallback(cwd, strict, 'binary-not-found');
  }

  const outcome = await runAgnix(cwd, strict, binary, timeoutMs);
  switch (outcome.kind) {
    case 'timeout':
      return fallback(cwd, strict, 'tool-timeout');
    case 'spawn-error':
    case 'tool-failure':
      return fallback(cwd, strict, 'tool-failure');
    case 'ok': {
      const parsed = parseAgnixOutput(outcome.stdout, cwd);
      if (parsed === null) return fallback(cwd, strict, 'tool-parse-error');
      const issues = strict ? promoteWarningsToErrors(parsed) : parsed;
      return {
        engine: 'agnix',
        valid: !hasErrors(issues),
        issues,
      };
    }
  }
}

/** Run only the fallback rule set (exposed for testing and deterministic CI usage). */
export { runFallbackRules } from './fallback';

async function fallback(
  cwd: string,
  strict: boolean,
  reason: AgentConfigFallbackReason
): Promise<AgentConfigValidation> {
  const raw = await runFallbackRules(cwd);
  const issues = strict ? promoteWarningsToErrors(raw) : raw;
  return {
    engine: 'fallback',
    valid: !hasErrors(issues),
    fellBackBecause: reason,
    issues,
  };
}

function promoteWarningsToErrors(findings: AgentConfigFinding[]): AgentConfigFinding[] {
  return findings.map((f) => (f.severity === 'warning' ? { ...f, severity: 'error' } : f));
}

function hasErrors(findings: AgentConfigFinding[]): boolean {
  return findings.some((f) => f.severity === 'error');
}
