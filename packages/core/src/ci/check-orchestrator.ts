import * as path from 'node:path';
import { skipDirGlobs } from '@harness-engineering/graph';
import { ArchBaselineManager } from '../architecture/baseline-manager';
import { diff } from '../architecture/diff';
import type {
  CICheckName,
  CICheckResult,
  CICheckReport,
  CICheckSummary,
  CICheckIssue,
  CIFailOnSeverity,
  ConstraintStage,
  ConstraintPackCompliance,
  ConstraintPackComplianceStatus,
} from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { resolveConstraintPacks } from '../constraints/packs';
import type { ResolvedConstraintPacks } from '../constraints/packs';
import { validateAgentsMap } from '../context/agents-map';
import { validateDependencies, defineLayer } from '../constraints/dependencies';
import { checkDocCoverage } from '../context/doc-coverage';
import { EntropyAnalyzer } from '../entropy/analyzer';
import type { DriftConfig } from '../entropy/types';
import { SecurityScanner } from '../security/scanner';
import { parseSecurityConfig } from '../security/config';
import { SECURITY_SCAN_GLOB } from '../security/scan-targets';
import { TypeScriptParser } from '../shared/parsers';
import { ArchConfigSchema, runAll as runArchCollectors } from '../architecture';
import { GraphStore, queryTraceability, resolveGraphDir } from '@harness-engineering/graph';

export interface RunCIChecksInput {
  projectRoot: string;
  config: Record<string, unknown>;
  skip?: CICheckName[];
  failOn?: CIFailOnSeverity;
  /**
   * Lifecycle stage to enforce. When set, only the opted-in constraint packs'
   * specs for this stage are applied and only those stages appear in the
   * per-pack compliance summary. When omitted, every stage of every opted-in
   * pack is applied (the most conservative combined gate).
   */
  stage?: ConstraintStage;
}

/**
 * Read the opted-in constraint pack names from the raw config. Non-string
 * entries and a non-array value are ignored (treated as "no packs").
 */
function constraintPackNames(config: Record<string, unknown>): string[] {
  const raw = config.constraintPacks;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === 'string');
}

/**
 * Overlay the resolved constraint packs onto a config, returning a shallow
 * clone with the packs' security-rule elevations merged into `security.rules`.
 *
 * Precedence: an explicit project-level `security.rules[id]` always wins over a
 * pack overlay, so a project retains a per-rule escape hatch to dial a rule
 * back down. But a pack opt-in is a more-specific, explicit intent to enforce
 * blocking rules, so it turns the security check on even when `security.enabled`
 * is false — opting into a blocking pack while globally disabling security is
 * contradictory, and the narrower signal wins.
 *
 * Force-enable blast radius: when the scanner was explicitly disabled
 * (`security.enabled: false`) and a pack force-enables it, we first silence
 * every rule the scanner blocks by default (`'SEC-*': 'off'`) and then let the
 * pack's specific prefixes re-elevate only what it targets. Without this base,
 * flipping `enabled` back on would run all default-error rules (including
 * prefixes no pack references, e.g. SEC-EDGE), so opting into one pack would
 * enable the whole scanner. With it, opting into a pack is truly equivalent to
 * setting only that pack's `security.rules` overrides. The base is injected
 * only in the force-enable case; a project that already runs the scanner keeps
 * its existing default-error rules untouched.
 */
function applyConstraintPackOverlay(
  config: Record<string, unknown>,
  resolved: ResolvedConstraintPacks
): Record<string, unknown> {
  const hasOverlay = Object.keys(resolved.securityRuleOverlay).length > 0;
  if (!hasOverlay) return config;

  const security = { ...((config.security as Record<string, unknown>) ?? {}) };
  const userRules = (security.rules as Record<string, unknown>) ?? {};
  const scannerWasDisabled = security.enabled === false;
  // Only when force-enabling a previously-disabled scanner: silence all rules
  // as the base, so non-pack rules stay non-blocking (see doc comment).
  const forceEnableBase: Record<string, unknown> = scannerWasDisabled ? { 'SEC-*': 'off' } : {};
  // Base first, then the pack's specific elevations, then the user's per-rule
  // overrides last so the project always wins.
  security.rules = { ...forceEnableBase, ...resolved.securityRuleOverlay, ...userRules };
  security.enabled = true;

  return { ...config, security };
}

/**
 * Read the project-wide `analysis.exclude` glob list from the raw config.
 * These excludes apply on top of each check's own excludes so a repo can
 * declare vendored or generated paths once (see `analysis` in the CLI's
 * HarnessConfigSchema).
 */
function analysisExclude(config: Record<string, unknown>): string[] {
  const analysis = config.analysis as Record<string, unknown> | undefined;
  const exclude = analysis?.exclude;
  return Array.isArray(exclude) ? exclude.filter((p): p is string => typeof p === 'string') : [];
}

const ALL_CHECKS: CICheckName[] = [
  'validate',
  'deps',
  'docs',
  'entropy',
  'security',
  'perf',
  'phase-gate',
  'arch',
  'traceability',
];

async function runValidateCheck(
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckIssue[]> {
  const issues: CICheckIssue[] = [];
  const agentsPath = path.join(projectRoot, (config.agentsMapPath as string) ?? 'AGENTS.md');
  const result = await validateAgentsMap(agentsPath);
  if (!result.ok) {
    issues.push({ severity: 'error', message: result.error.message });
  } else if (!result.value.valid) {
    if (result.value.errors) {
      for (const err of result.value.errors) {
        issues.push({ severity: 'error', message: err.message });
      }
    }
    for (const section of result.value.missingSections) {
      issues.push({ severity: 'warning', message: `Missing section: ${section}` });
    }
    for (const link of result.value.brokenLinks) {
      issues.push({
        severity: 'warning',
        message: `Broken link: ${link.text} → ${link.path}`,
        file: link.path,
      });
    }
  }
  return issues;
}

async function runDepsCheck(
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckIssue[]> {
  const issues: CICheckIssue[] = [];
  const rawLayers = config.layers as Array<Record<string, unknown>> | undefined;
  if (rawLayers && rawLayers.length > 0) {
    const parser = new TypeScriptParser();
    const layers = rawLayers.map((l) =>
      defineLayer(
        l.name as string,
        Array.isArray(l.patterns) ? (l.patterns as string[]) : [l.pattern as string],
        l.allowedDependencies as string[]
      )
    );
    const result = await validateDependencies({
      layers,
      rootDir: projectRoot,
      parser,
    });
    if (!result.ok) {
      issues.push({ severity: 'error', message: result.error.message });
    } else if (result.value.violations.length > 0) {
      for (const v of result.value.violations) {
        issues.push({
          severity: 'error',
          message: `${v.reason}: ${v.file} imports ${v.imports} (${v.fromLayer} → ${v.toLayer})`,
          file: v.file,
          line: v.line,
        });
      }
    }
  }
  return issues;
}

async function runDocsCheck(
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckIssue[]> {
  const issues: CICheckIssue[] = [];
  const docsDir = path.join(projectRoot, (config.docsDir as string) ?? 'docs');
  const entropyConfig = (config.entropy as Record<string, unknown>) || {};
  const result = await checkDocCoverage('project', {
    docsDir,
    sourceDir: projectRoot,
    excludePatterns: [
      ...((entropyConfig.excludePatterns as string[]) || [
        ...skipDirGlobs(),
        '**/*.test.ts',
        '**/fixtures/**',
      ]),
      ...analysisExclude(config),
    ],
  });
  if (!result.ok) {
    issues.push({ severity: 'warning', message: result.error.message });
  } else if (result.value.gaps.length > 0) {
    for (const gap of result.value.gaps) {
      issues.push({
        severity: 'warning',
        message: `Undocumented: ${gap.file} (suggested: ${gap.suggestedSection})`,
        file: gap.file,
      });
    }
  }
  return issues;
}

async function runEntropyCheck(
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckIssue[]> {
  const issues: CICheckIssue[] = [];
  const entropyConfig = (config.entropy as Record<string, unknown>) || {};
  const perfConfig = (config.performance as Record<string, unknown>) || {};
  // Fallback: use performance entry points if entropy section has none configured
  const entryPoints =
    (entropyConfig.entryPoints as string[]) ?? (perfConfig.entryPoints as string[]);
  // Thread the project's drift tuning (entropy.drift) into analyze.drift so
  // checkApiSignatures / ignorePatterns / forwardLookingPaths / docPaths are
  // honored instead of falling back to DEFAULT_DRIFT_CONFIG — issue #723.
  const driftConfig = entropyConfig.drift as Partial<DriftConfig> | undefined;
  // Honor entropy.excludePatterns (previously dropped on this path) plus the
  // project-wide analysis.exclude globs; fall back to the snapshot defaults.
  const exclude = [
    ...((entropyConfig.excludePatterns as string[]) || [
      ...skipDirGlobs(),
      '**/*.test.ts',
      '**/*.spec.ts',
    ]),
    ...analysisExclude(config),
  ];
  const analyzer = new EntropyAnalyzer({
    rootDir: projectRoot,
    ...(entryPoints ? { entryPoints } : {}),
    ...(driftConfig?.docPaths ? { docPaths: driftConfig.docPaths } : {}),
    exclude,
    analyze: { drift: driftConfig ?? true, deadCode: true, patterns: false },
  });
  const result = await analyzer.analyze();
  if (!result.ok) {
    issues.push({ severity: 'warning', message: result.error.message });
  } else {
    const report = result.value;
    if (report.drift) {
      for (const drift of report.drift.drifts) {
        issues.push({
          severity: 'warning',
          message: `Doc drift (${drift.type}): ${drift.details}`,
          file: drift.docFile,
          line: drift.line,
        });
      }
    }
    if (report.deadCode) {
      for (const dead of report.deadCode.deadExports) {
        issues.push({
          severity: 'warning',
          message: `Dead export: ${dead.name}`,
          file: dead.file,
          line: dead.line,
        });
      }
    }
  }
  return issues;
}

async function runSecurityCheck(
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckIssue[]> {
  const issues: CICheckIssue[] = [];
  const securityConfig = parseSecurityConfig((config as Record<string, unknown>).security);
  if (!securityConfig.enabled) return issues;

  const scanner = new SecurityScanner(securityConfig);
  scanner.configureForProject(projectRoot);

  // Scan source files using glob. The pattern is shared (security/scan-targets.ts)
  // — this copy had drifted furthest, missing java/rb as well as .mjs/.cjs.
  const { glob: globFn } = await import('glob');
  const sourceFiles = await globFn(SECURITY_SCAN_GLOB, {
    cwd: projectRoot,
    ignore: [
      ...(securityConfig.exclude ?? [...skipDirGlobs(), '**/*.test.ts', '**/fixtures/**']),
      ...analysisExclude(config),
    ],
    absolute: true,
  });

  const scanResult = await scanner.scanFiles(sourceFiles);

  for (const finding of scanResult.findings) {
    issues.push({
      severity: finding.severity === 'info' ? 'warning' : finding.severity,
      message: `[${finding.ruleId}] ${finding.message}: ${finding.match}`,
      file: finding.file,
      line: finding.line,
      ruleId: finding.ruleId,
    });
  }
  return issues;
}

async function runPerfCheck(
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckIssue[]> {
  const issues: CICheckIssue[] = [];
  const perfConfig = (config.performance as Record<string, unknown>) || {};
  const entryPoints = perfConfig.entryPoints as string[] | undefined;
  const perfAnalyzer = new EntropyAnalyzer({
    rootDir: projectRoot,
    ...(entryPoints ? { entryPoints } : {}),
    analyze: {
      complexity: perfConfig.complexity || true,
      coupling: perfConfig.coupling || true,
      sizeBudget: perfConfig.sizeBudget || false,
    },
  });
  const perfResult = await perfAnalyzer.analyze();
  if (!perfResult.ok) {
    issues.push({ severity: 'warning', message: perfResult.error.message });
  } else {
    const perfReport = perfResult.value;
    if (perfReport.complexity) {
      for (const v of perfReport.complexity.violations) {
        // Complexity violations are baselined by the arch check — report as warnings here to avoid double-gating
        issues.push({
          severity: 'warning',
          message: `[Tier ${v.tier}] ${v.metric}: ${v.function} in ${v.file} (${v.value} > ${v.threshold})`,
          file: v.file,
          line: v.line,
        });
      }
    }
    if (perfReport.coupling) {
      for (const v of perfReport.coupling.violations) {
        issues.push({
          severity: v.severity === 'info' ? 'warning' : v.severity,
          message: `[Tier ${v.tier}] ${v.metric}: ${v.file} (${v.value} > ${v.threshold})`,
          file: v.file,
        });
      }
    }
  }
  return issues;
}

async function runPhaseGateCheck(
  _projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckIssue[]> {
  const issues: CICheckIssue[] = [];
  const phaseGates = config.phaseGates as Record<string, unknown> | undefined;
  if (!phaseGates?.enabled) {
    // Phase gates not configured — skip silently (not an error)
    return issues;
  }
  // Phase gate validation requires CLI-level context (config resolution,
  // spec/impl pattern matching). The core orchestrator cannot run it
  // directly. When phase gates are enabled, the CI check reports this
  // limitation so users know to also run `harness check-phase-gate`.
  issues.push({
    severity: 'warning',
    message:
      'Phase gate is enabled but requires CLI context. Run `harness check-phase-gate` separately for full validation.',
  });
  return issues;
}

async function runArchCheck(
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckIssue[]> {
  const issues: CICheckIssue[] = [];
  const rawArchConfig = config.architecture as Record<string, unknown> | undefined;
  const archConfig = ArchConfigSchema.parse(rawArchConfig ?? {});
  if (!archConfig.enabled) return issues;

  const results = await runArchCollectors(archConfig, projectRoot);

  // Load baseline and diff if available
  const baselineManager = new ArchBaselineManager(projectRoot, archConfig.baselinePath);
  const baseline = baselineManager.load();

  if (baseline) {
    const diffResult = diff(results, baseline, {
      regressionTolerance: archConfig.regressionTolerance,
    });
    if (!diffResult.passed) {
      for (const v of diffResult.newViolations) {
        issues.push({
          severity: v.severity,
          message: `[${v.category || 'arch'}] NEW: ${v.detail}`,
          file: v.file,
        });
      }
      for (const r of diffResult.regressions) {
        issues.push({
          severity: 'error',
          message: `[${r.category}] REGRESSION: ${r.currentValue} > ${r.baselineValue} (delta: ${r.delta})`,
        });
      }
    }
  } else {
    // No baseline, report all as warnings or errors based on config
    for (const result of results) {
      for (const v of result.violations) {
        issues.push({
          severity: v.severity,
          message: `[${result.category}] ${v.detail}`,
          file: v.file,
        });
      }
    }
  }
  return issues;
}

async function runTraceabilityCheck(
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckIssue[]> {
  const issues: CICheckIssue[] = [];
  const traceConfig = (config.traceability as Record<string, unknown>) || {};
  if (traceConfig.enabled === false) return issues;

  const graphDir = resolveGraphDir(projectRoot);
  const store = new GraphStore();
  const loaded = await store.load(graphDir);
  if (!loaded) {
    // No graph available — skip silently
    return issues;
  }

  const results = queryTraceability(store);
  if (results.length === 0) return issues;

  const minCoverage = (traceConfig.minCoverage as number) ?? 0;
  const severity = (traceConfig.severity as 'error' | 'warning') ?? 'warning';

  for (const result of results) {
    const pct = result.summary.coveragePercent;
    if (pct < minCoverage) {
      issues.push({
        severity,
        message: `Traceability coverage for "${result.featureName}" is ${pct}% (minimum: ${minCoverage}%)`,
      });
    }
    for (const req of result.requirements) {
      if (req.status === 'none') {
        issues.push({
          severity: 'warning',
          message: `Requirement "${req.requirementName}" has no traced code or tests`,
        });
      }
    }
  }
  return issues;
}

async function runSingleCheck(
  name: CICheckName,
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckResult> {
  const start = Date.now();
  const issues: CICheckIssue[] = [];

  try {
    switch (name) {
      case 'validate':
        issues.push(...(await runValidateCheck(projectRoot, config)));
        break;
      case 'deps':
        issues.push(...(await runDepsCheck(projectRoot, config)));
        break;
      case 'docs':
        issues.push(...(await runDocsCheck(projectRoot, config)));
        break;
      case 'entropy':
        issues.push(...(await runEntropyCheck(projectRoot, config)));
        break;
      case 'security':
        issues.push(...(await runSecurityCheck(projectRoot, config)));
        break;
      case 'perf':
        issues.push(...(await runPerfCheck(projectRoot, config)));
        break;
      case 'phase-gate':
        issues.push(...(await runPhaseGateCheck(projectRoot, config)));
        break;
      case 'arch':
        issues.push(...(await runArchCheck(projectRoot, config)));
        break;
      case 'traceability':
        issues.push(...(await runTraceabilityCheck(projectRoot, config)));
        break;
    }
  } catch (error) {
    issues.push({
      severity: 'error',
      message: `Check '${name}' threw: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasWarnings = issues.some((i) => i.severity === 'warning');
  const status = hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass';

  return {
    name,
    status,
    issues,
    durationMs: Date.now() - start,
  };
}

function buildSummary(checks: CICheckResult[]): CICheckSummary {
  return {
    total: checks.length,
    passed: checks.filter((c) => c.status === 'pass').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    warnings: checks.filter((c) => c.status === 'warn').length,
    skipped: checks.filter((c) => c.status === 'skip').length,
  };
}

function determineExitCode(summary: CICheckSummary, failOn: CIFailOnSeverity = 'error'): 0 | 1 | 2 {
  if (summary.failed > 0) return 1;
  if (failOn === 'warning' && summary.warnings > 0) return 1;
  return 0;
}

/** True when `ruleId` is covered by one of the pack patterns (exact or `*`). */
function ruleMatchesAny(ruleId: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('*') ? ruleId.startsWith(pattern.slice(0, -1)) : ruleId === pattern
  );
}

/**
 * Compute the per-pack, per-stage compliance summary for the opted-in packs.
 * A pack governs a specific set of security rules (its per-stage elevations),
 * so its verdict is attributed, not aggregate: a stage is `non-compliant` only
 * when a *failing* security finding's rule id is covered by that stage's own
 * rule prefixes. A failing finding from a rule no pack references — or one that
 * belongs to a different pack — never marks this pack non-compliant. A stage is
 * `n/a` when it is out of scope for this run or the security check was skipped,
 * and `compliant` otherwise.
 */
function computeConstraintPackCompliance(
  resolved: ResolvedConstraintPacks,
  securityCheck: CICheckResult | undefined,
  runStage: ConstraintStage | undefined
): ConstraintPackCompliance[] {
  const securitySkippedOrAbsent = !securityCheck || securityCheck.status === 'skip';
  // Rule ids of the security findings that actually fail the gate.
  const failingRuleIds = securitySkippedOrAbsent
    ? []
    : securityCheck!.issues
        .filter((issue) => issue.severity === 'error' && typeof issue.ruleId === 'string')
        .map((issue) => issue.ruleId as string);

  return resolved.resolved.map((pack) => ({
    pack: pack.name,
    stages: (Object.keys(pack.stages) as ConstraintStage[]).map((stage) => {
      let status: ConstraintPackComplianceStatus;
      if ((runStage && runStage !== stage) || securitySkippedOrAbsent) {
        status = 'n/a';
      } else {
        const patterns = Object.keys(pack.stages[stage]?.securityRules ?? {});
        const violated = failingRuleIds.some((ruleId) => ruleMatchesAny(ruleId, patterns));
        status = violated ? 'non-compliant' : 'compliant';
      }
      return { stage, status };
    }),
  }));
}

/**
 * Attach the constraint-pack sections to a report, in place. Populated only
 * when the project opted into at least one resolvable or unknown pack.
 */
function attachConstraintPackResults(
  report: CICheckReport,
  resolvedPacks: ResolvedConstraintPacks,
  checks: CICheckResult[],
  stage: ConstraintStage | undefined
): void {
  if (resolvedPacks.resolved.length > 0) {
    const securityCheck = checks.find((c) => c.name === 'security');
    report.constraintPacks = computeConstraintPackCompliance(resolvedPacks, securityCheck, stage);
  }
  if (resolvedPacks.unknown.length > 0) {
    report.unknownConstraintPacks = resolvedPacks.unknown;
  }
}

/**
 * Run every check (validate first, the rest in parallel), honoring the skip
 * set. Extracted so the top-level orchestrator stays small.
 */
async function runAllChecks(
  projectRoot: string,
  config: Record<string, unknown>,
  skippedSet: Set<CICheckName>
): Promise<CICheckResult[]> {
  const checks: CICheckResult[] = [];

  // Phase 1: validate runs first (deps may depend on config resolution)
  if (skippedSet.has('validate')) {
    checks.push({ name: 'validate', status: 'skip', issues: [], durationMs: 0 });
  } else {
    checks.push(await runSingleCheck('validate', projectRoot, config));
  }

  // Phase 2: all remaining checks in parallel
  const phase2Results = await Promise.all(
    ALL_CHECKS.slice(1).map(async (name) => {
      if (skippedSet.has(name)) {
        return { name, status: 'skip' as const, issues: [] as CICheckIssue[], durationMs: 0 };
      }
      return runSingleCheck(name, projectRoot, config);
    })
  );
  checks.push(...phase2Results);

  return checks;
}

export async function runCIChecks(input: RunCIChecksInput): Promise<Result<CICheckReport, Error>> {
  const { projectRoot, config, skip = [], failOn = 'error', stage } = input;

  try {
    // Resolve opted-in constraint packs and overlay their blocking-rule
    // elevations onto the config the checks actually see. Absent/empty
    // `constraintPacks` leaves the config untouched (current behavior).
    const resolvedPacks = resolveConstraintPacks(
      constraintPackNames(config),
      stage ? { stage } : {}
    );
    const effectiveConfig = applyConstraintPackOverlay(config, resolvedPacks);

    const checks = await runAllChecks(projectRoot, effectiveConfig, new Set(skip));

    const summary = buildSummary(checks);
    const exitCode = determineExitCode(summary, failOn);

    const report: CICheckReport = {
      version: 1,
      project: (config.name as string) ?? 'unknown',
      timestamp: new Date().toISOString(),
      checks,
      summary,
      exitCode,
    };

    attachConstraintPackResults(report, resolvedPacks, checks, stage);

    return Ok(report);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}
