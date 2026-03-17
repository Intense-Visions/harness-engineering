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
import { validateDependencies } from '../constraints/dependencies';
import { checkDocCoverage } from '../context/doc-coverage';
import { EntropyAnalyzer } from '../entropy/analyzer';

export interface RunCIChecksInput {
  projectRoot: string;
  config: Record<string, unknown>;
  skip?: CICheckName[];
  failOn?: CIFailOnSeverity;
}

const ALL_CHECKS: CICheckName[] = ['validate', 'deps', 'docs', 'entropy', 'phase-gate'];

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
        const agentsPath = `${projectRoot}/${(config.agentsMapPath as string) ?? 'AGENTS.md'}`;
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
        const layers = config.layers as Array<Record<string, unknown>> | undefined;
        if (layers && layers.length > 0) {
          const { TypeScriptParser } = await import('../shared/parsers');
          const parser = new TypeScriptParser();
          const result = await validateDependencies({
            layers: layers as never,
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
        const docsDir = `${projectRoot}/${(config.docsDir as string) ?? 'docs'}`;
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
        }
        break;
      }

      case 'phase-gate': {
        const phaseGates = config.phaseGates as Record<string, unknown> | undefined;
        if (phaseGates?.enabled) {
          issues.push({
            severity: 'warning',
            message: 'Phase gate check requires CLI context. Use harness check-phase-gate directly.',
          });
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

function determineExitCode(
  summary: CICheckSummary,
  failOn: CIFailOnSeverity = 'error'
): 0 | 1 | 2 {
  if (summary.failed > 0) return 1;
  if (failOn === 'warning' && summary.warnings > 0) return 1;
  return 0;
}

export async function runCIChecks(
  input: RunCIChecksInput
): Promise<Result<CICheckReport, Error>> {
  const { projectRoot, config, skip = [], failOn = 'error' } = input;

  try {
    const checks: CICheckResult[] = [];

    for (const name of ALL_CHECKS) {
      if (skip.includes(name)) {
        checks.push({ name, status: 'skip', issues: [], durationMs: 0 });
      } else {
        const result = await runSingleCheck(name, projectRoot, config);
        checks.push(result);
      }
    }

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
