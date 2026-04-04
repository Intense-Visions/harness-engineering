import * as path from 'node:path';
import { ArchBaselineManager } from '../architecture/baseline-manager';
import { diff } from '../architecture/diff';
import type {
  CICheckName,
  CICheckResult,
  CICheckReport,
  CICheckSummary,
  CICheckIssue,
  CIFailOnSeverity,
} from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { validateAgentsMap } from '../context/agents-map';
import { validateDependencies, defineLayer } from '../constraints/dependencies';
import { checkDocCoverage } from '../context/doc-coverage';
import { EntropyAnalyzer } from '../entropy/analyzer';
import { SecurityScanner } from '../security/scanner';
import { parseSecurityConfig } from '../security/config';
import { TypeScriptParser } from '../shared/parsers';
import { ArchConfigSchema, runAll as runArchCollectors } from '../architecture';
import { GraphStore, queryTraceability } from '@harness-engineering/graph';

export interface RunCIChecksInput {
  projectRoot: string;
  config: Record<string, unknown>;
  skip?: CICheckName[];
  failOn?: CIFailOnSeverity;
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
    excludePatterns: (entropyConfig.excludePatterns as string[]) || [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.ts',
      '**/fixtures/**',
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
  const analyzer = new EntropyAnalyzer({
    rootDir: projectRoot,
    ...(entryPoints ? { entryPoints } : {}),
    analyze: { drift: true, deadCode: true, patterns: false },
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

  // Scan source files using glob
  const { glob: globFn } = await import('glob');
  const sourceFiles = await globFn('**/*.{ts,tsx,js,jsx,go,py}', {
    cwd: projectRoot,
    ignore: securityConfig.exclude ?? [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.test.ts',
      '**/fixtures/**',
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
    const diffResult = diff(results, baseline);
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

  const graphDir = path.join(projectRoot, '.harness', 'graph');
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

export async function runCIChecks(input: RunCIChecksInput): Promise<Result<CICheckReport, Error>> {
  const { projectRoot, config, skip = [], failOn = 'error' } = input;

  try {
    const checks: CICheckResult[] = [];
    const skippedSet = new Set(skip);

    // Phase 1: validate runs first (deps may depend on config resolution)
    if (skippedSet.has('validate')) {
      checks.push({ name: 'validate', status: 'skip', issues: [], durationMs: 0 });
    } else {
      checks.push(await runSingleCheck('validate', projectRoot, config));
    }

    // Phase 2: all remaining checks in parallel
    const remainingChecks = ALL_CHECKS.slice(1);
    const phase2Results = await Promise.all(
      remainingChecks.map(async (name) => {
        if (skippedSet.has(name)) {
          return { name, status: 'skip' as const, issues: [] as CICheckIssue[], durationMs: 0 };
        }
        return runSingleCheck(name, projectRoot, config);
      })
    );
    checks.push(...phase2Results);

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

    return Ok(report);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}
