import * as path from 'node:path';
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
];

async function runSingleCheck(
  name: CICheckName,
  projectRoot: string,
  config: Record<string, unknown>
): Promise<CICheckResult> {
  const start = Date.now();
  const issues: CICheckIssue[] = [];

  try {
    switch (name) {
      case 'validate': {
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
        break;
      }

      case 'deps': {
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
        break;
      }

      case 'docs': {
        const docsDir = path.join(projectRoot, (config.docsDir as string) ?? 'docs');
        const result = await checkDocCoverage('project', { docsDir });
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
        break;
      }

      case 'entropy': {
        const analyzer = new EntropyAnalyzer({
          rootDir: projectRoot,
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
        break;
      }

      case 'security': {
        const securityConfig = parseSecurityConfig((config as Record<string, unknown>).security);
        if (!securityConfig.enabled) break;

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
        break;
      }

      case 'perf': {
        const perfAnalyzer = new EntropyAnalyzer({
          rootDir: projectRoot,
          analyze: {
            complexity: true,
            coupling: true,
          },
        });
        const perfResult = await perfAnalyzer.analyze();
        if (!perfResult.ok) {
          issues.push({ severity: 'warning', message: perfResult.error.message });
        } else {
          const perfReport = perfResult.value;
          if (perfReport.complexity) {
            for (const v of perfReport.complexity.violations) {
              issues.push({
                severity: v.severity === 'info' ? 'warning' : v.severity,
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
        break;
      }

      case 'phase-gate': {
        const phaseGates = config.phaseGates as Record<string, unknown> | undefined;
        if (!phaseGates?.enabled) {
          // Phase gates not configured — skip silently (not an error)
          break;
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
        break;
      }

      case 'arch': {
        const rawArchConfig = config.architecture as Record<string, unknown> | undefined;
        const archConfig = ArchConfigSchema.parse(rawArchConfig ?? {});
        if (!archConfig.enabled) break;

        const results = await runArchCollectors(archConfig, projectRoot);
        for (const result of results) {
          for (const v of result.violations) {
            issues.push({
              severity: v.severity,
              message: `[${result.category}] ${v.detail}`,
              file: v.file,
            });
          }
        }
        break;
      }
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
