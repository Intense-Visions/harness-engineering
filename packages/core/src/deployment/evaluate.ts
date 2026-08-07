import { SecurityScanner } from '../security';
import type {
  DeploymentFinding,
  DeploymentGateConfig,
  DeploymentGateResult,
  DeploymentSeverity,
  DeploymentSurface,
} from './types';

/**
 * Classify a {@link DeploymentSurface} into a block/advise/abstain result.
 *
 * Pure and synchronous: reuses {@link SecurityScanner.scanFileContent} (in-memory,
 * no disk read) for the non-waivable secret rule and never runs a deploy. Status
 * routing is: `disabled` (opt-out) and `abstained` (examined nothing) short-circuit
 * before any rule fires; otherwise `blocked` when a hard finding exists, else `pass`.
 */

/**
 * Resolve a rule's effective severity honoring a `rules` override. `'off'` on a
 * waivable HARD rule downgrades it to a `'soft'` advisory. DEPLOY-SEC001 is
 * non-waivable and never routes through here (D4).
 */
function resolveSeverity(
  code: string,
  base: DeploymentSeverity,
  rules: DeploymentGateConfig['rules']
): DeploymentSeverity {
  if (rules?.[code] === 'off') return 'soft';
  return base;
}

/** Recommended pre-deploy stages a mature pipeline should carry. */
const RECOMMENDED_STAGES = ['security-scan', 'smoke-test'];

/** Parse `KEY=value` / `KEY: value` lines into a map, skipping comments/blanks. */
function parseEnvPairs(content: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.*)$/.exec(line);
    const key = m?.[1];
    if (!key) continue;
    pairs.set(key, (m?.[2] ?? '').trim());
  }
  return pairs;
}

/** True when two committed env files share an identical non-empty value for the same key. */
function hasSharedEnvConfig(surface: DeploymentSurface): boolean {
  const parsed = surface.envFiles.map((f) => parseEnvPairs(f.content));
  for (let i = 0; i < parsed.length; i++) {
    const a = parsed[i];
    if (!a) continue;
    for (let j = i + 1; j < parsed.length; j++) {
      const b = parsed[j];
      if (!b) continue;
      for (const [k, v] of a) {
        if (v !== '' && b.get(k) === v) return true;
      }
    }
  }
  return false;
}

/** True when a pipeline chains jobs (`needs:`) without any caching directive. */
function hasSerialNoCacheSmell(surface: DeploymentSurface): boolean {
  return surface.pipelineFiles.some(
    (f) => /needs:/i.test(f.content) && !/cache/i.test(f.content)
  );
}

/** DEPLOY-SEC001 — hardcoded secret literal in a pipeline or committed env file (non-waivable). */
function evaluateSecrets(surface: DeploymentSurface): DeploymentFinding[] {
  const scanner = new SecurityScanner();
  const findings: DeploymentFinding[] = [];
  const scanTargets = [...surface.pipelineFiles, ...surface.envFiles];
  for (const file of scanTargets) {
    const secretFindings = scanner
      .scanFileContent(file.content, file.path)
      .filter((f) => f.category === 'secrets');
    if (secretFindings.length === 0) continue;
    findings.push({
      code: 'DEPLOY-SEC001',
      severity: 'hard', // non-waivable — the `rules` override is not consulted (D4).
      file: file.path,
      detail: `Hardcoded secret literal detected in ${file.path}. A committed pipeline or env file must never embed a secret value.`,
      remediation:
        'Move the secret to an environment variable or CI secret store (e.g. `${{ secrets.NAME }}`, `process.env.NAME`). This rule cannot be waived via config.',
    });
  }
  return findings;
}

export function evaluateDeploymentGate(
  surface: DeploymentSurface,
  config?: DeploymentGateConfig
): DeploymentGateResult {
  const rollbackPathPresent =
    surface.rollbackSignalInFiles || config?.rollbackConfigured === true;
  const base = {
    detectedEnvironments: surface.detectedEnvironments,
    rollbackPathPresent,
  };

  // --- Status routing: opt-out and abstention short-circuit before any rule. ---
  if (config?.enabled === false) {
    return {
      status: 'disabled',
      findings: [],
      hardViolations: [],
      softViolations: [],
      ...base,
    };
  }

  const hasSurface =
    surface.pipelineFiles.length + surface.deployScripts.length + surface.envFiles.length > 0;
  const configPresent = config != null;
  if (!hasSurface && !configPresent) {
    return {
      status: 'abstained',
      findings: [],
      hardViolations: [],
      softViolations: [],
      ...base,
    };
  }

  const rules = config?.rules;
  const findings: DeploymentFinding[] = [];

  // DEPLOY-SEC001 — non-waivable hardcoded-secret detection.
  findings.push(...evaluateSecrets(surface));

  const deployTargetExists =
    surface.hasProductionTarget ||
    surface.pipelineFiles.length > 0 ||
    surface.deployScripts.length > 0;

  // DEPLOY-RB001 — a reachable deploy target with no rollback path (waivable).
  if (deployTargetExists && !rollbackPathPresent) {
    findings.push({
      code: 'DEPLOY-RB001',
      severity: resolveSeverity('DEPLOY-RB001', 'hard', rules),
      detail:
        'A deploy target is reachable but no rollback path exists (no rollback config, no revert/rollback workflow or deploy/rollback script, no runbook). Pre-ship review and a post-ship revert path are complementary — both are required.',
      remediation:
        'Add a rollback path: a `harness-rollback` runbook/workflow, a `deploy/rollback` script, or a `rollback` config block so a bad deploy can be reverted.',
    });
  }

  // DEPLOY-ENV001 — production reachable with no promotion/approval/protection gate (waivable).
  if (surface.productionUngated) {
    findings.push({
      code: 'DEPLOY-ENV001',
      severity: resolveSeverity('DEPLOY-ENV001', 'hard', rules),
      detail:
        'A production deploy is reachable with no environment protection, no manual approval, and no prior staging/promotion job.',
      remediation:
        'Gate production behind an environment protection rule, a manual approval, or a prior staging/promotion job.',
    });
  }

  // --- Soft advisories (never block; always severity 'soft'). ---
  if (deployTargetExists) {
    const unparseable = surface.pipelineFiles.filter((f) => f.unparseable);
    const missingStages = RECOMMENDED_STAGES.filter((s) => !surface.presentStages.includes(s));
    if (unparseable.length > 0 || missingStages.length > 0) {
      const reasons: string[] = [];
      if (missingStages.length > 0) {
        reasons.push(`missing recommended stage(s): ${missingStages.join(', ')}`);
      }
      if (unparseable.length > 0) {
        reasons.push(
          `unparseable pipeline file(s): ${unparseable.map((f) => f.path).join(', ')}`
        );
      }
      findings.push({
        code: 'DEPLOY-STAGE001',
        severity: 'soft',
        ...(unparseable[0] ? { file: unparseable[0].path } : {}),
        detail: `Deploy pipeline advisory — ${reasons.join('; ')}.`,
        remediation:
          'Add the recommended pre-deploy stages (security scan, smoke test) and fix any unparseable pipeline file so the gate can inspect it.',
      });
    }

    // DEPLOY-HC001 — no post-deploy health check for a deploy target.
    if (!surface.hasHealthCheck) {
      findings.push({
        code: 'DEPLOY-HC001',
        severity: 'soft',
        detail: 'No post-deploy health check is wired for the detected deploy target.',
        remediation: 'Add a post-deploy health/smoke check so a bad deploy is caught automatically.',
      });
    }

    // DEPLOY-ENV002 — weak env separation (shared non-secret config across environments).
    if (hasSharedEnvConfig(surface)) {
      findings.push({
        code: 'DEPLOY-ENV002',
        severity: 'soft',
        detail:
          'Committed environment files share identical non-secret configuration across environments, weakening env separation.',
        remediation:
          'Diverge per-environment configuration (URLs, feature flags, resource sizing) so environments are meaningfully isolated.',
      });
    }

    // DEPLOY-PERF001 — pipeline structure smell (serial stages, no caching).
    if (hasSerialNoCacheSmell(surface)) {
      findings.push({
        code: 'DEPLOY-PERF001',
        severity: 'soft',
        detail:
          'Pipeline chains jobs serially (`needs:`) with no caching directive, which slows deploys.',
        remediation:
          'Add dependency/build caching and parallelize independent stages to shorten the pipeline.',
      });
    }
  }

  const hardViolations = findings.filter((f) => f.severity === 'hard');
  const softViolations = findings.filter((f) => f.severity === 'soft');
  const status: DeploymentGateResult['status'] = hardViolations.length > 0 ? 'blocked' : 'pass';

  return {
    status,
    findings,
    hardViolations,
    softViolations,
    ...base,
  };
}
