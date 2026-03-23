import * as path from 'node:path';
import type { Result } from '../shared/result';
import { Ok } from '../shared/result';
import type {
  MechanicalFinding,
  MechanicalCheckResult,
  MechanicalCheckStatus,
  MechanicalCheckOptions,
} from './types';
import { validateAgentsMap } from '../context/agents-map';
import { validateDependencies, defineLayer } from '../constraints/dependencies';
import { checkDocCoverage } from '../context/doc-coverage';
import { SecurityScanner } from '../security/scanner';
import { parseSecurityConfig } from '../security/config';
import { TypeScriptParser } from '../shared/parsers';

type CheckName = 'validate' | 'check-deps' | 'check-docs' | 'security-scan';

/**
 * Run all mechanical checks and produce the exclusion set inputs.
 *
 * Mechanical checks that fail with errors (validate, check-deps) set `stopPipeline: true`.
 * Checks that produce warnings (check-docs, security-scan) record findings but do NOT stop the pipeline.
 */
export async function runMechanicalChecks(
  options: MechanicalCheckOptions
): Promise<Result<MechanicalCheckResult, Error>> {
  const { projectRoot, config, skip = [], changedFiles } = options;
  const findings: MechanicalFinding[] = [];

  const statuses: Record<CheckName, MechanicalCheckStatus> = {
    validate: 'skip',
    'check-deps': 'skip',
    'check-docs': 'skip',
    'security-scan': 'skip',
  };

  // --- Validate ---
  if (!skip.includes('validate')) {
    try {
      const agentsPath = path.join(projectRoot, (config.agentsMapPath as string) ?? 'AGENTS.md');
      const result = await validateAgentsMap(agentsPath);
      if (!result.ok) {
        statuses.validate = 'fail';
        findings.push({
          tool: 'validate',
          file: agentsPath,
          message: result.error.message,
          severity: 'error',
        });
      } else if (!result.value.valid) {
        statuses.validate = 'fail';
        if (result.value.errors) {
          for (const err of result.value.errors) {
            findings.push({
              tool: 'validate',
              file: agentsPath,
              message: err.message,
              severity: 'error',
            });
          }
        }
        for (const section of result.value.missingSections) {
          findings.push({
            tool: 'validate',
            file: agentsPath,
            message: `Missing section: ${section}`,
            severity: 'warning',
          });
        }
      } else {
        statuses.validate = 'pass';
      }
    } catch (err) {
      statuses.validate = 'fail';
      findings.push({
        tool: 'validate',
        file: path.join(projectRoot, 'AGENTS.md'),
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      });
    }
  }

  // --- Check-deps ---
  if (!skip.includes('check-deps')) {
    try {
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
          statuses['check-deps'] = 'fail';
          findings.push({
            tool: 'check-deps',
            file: projectRoot,
            message: result.error.message,
            severity: 'error',
          });
        } else if (result.value.violations.length > 0) {
          statuses['check-deps'] = 'fail';
          for (const v of result.value.violations) {
            findings.push({
              tool: 'check-deps',
              file: v.file,
              line: v.line,
              message: `Layer violation: ${v.fromLayer} -> ${v.toLayer}: ${v.reason}`,
              severity: 'error',
            });
          }
        } else {
          statuses['check-deps'] = 'pass';
        }
      } else {
        statuses['check-deps'] = 'pass';
      }
    } catch (err) {
      statuses['check-deps'] = 'fail';
      findings.push({
        tool: 'check-deps',
        file: projectRoot,
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      });
    }
  }

  // --- Phase 2: Parallel warning-only checks ---
  // Each check returns its own findings array; merged after Promise.all to avoid
  // concurrent mutation of the shared findings array.

  const parallelChecks: Array<Promise<MechanicalFinding[]>> = [];

  // --- Check-docs ---
  if (!skip.includes('check-docs')) {
    parallelChecks.push(
      (async (): Promise<MechanicalFinding[]> => {
        const localFindings: MechanicalFinding[] = [];
        try {
          const docsDir = path.join(projectRoot, (config.docsDir as string) ?? 'docs');
          const result = await checkDocCoverage('project', { docsDir });
          if (!result.ok) {
            statuses['check-docs'] = 'warn';
            localFindings.push({
              tool: 'check-docs',
              file: docsDir,
              message: result.error.message,
              severity: 'warning',
            });
          } else if (result.value.gaps && result.value.gaps.length > 0) {
            statuses['check-docs'] = 'warn';
            for (const gap of result.value.gaps) {
              localFindings.push({
                tool: 'check-docs',
                file: gap.file,
                message: `Undocumented: ${gap.file} (suggested: ${gap.suggestedSection})`,
                severity: 'warning',
              });
            }
          } else {
            statuses['check-docs'] = 'pass';
          }
        } catch (err) {
          statuses['check-docs'] = 'warn';
          localFindings.push({
            tool: 'check-docs',
            file: path.join(projectRoot, 'docs'),
            message: err instanceof Error ? err.message : String(err),
            severity: 'warning',
          });
        }
        return localFindings;
      })()
    );
  }

  // --- Security scan ---
  if (!skip.includes('security-scan')) {
    parallelChecks.push(
      (async (): Promise<MechanicalFinding[]> => {
        const localFindings: MechanicalFinding[] = [];
        try {
          const securityConfig = parseSecurityConfig((config as Record<string, unknown>).security);
          if (!securityConfig.enabled) {
            statuses['security-scan'] = 'skip';
          } else {
            const scanner = new SecurityScanner(securityConfig);
            scanner.configureForProject(projectRoot);

            const filesToScan = changedFiles ?? [];
            const scanResult = await scanner.scanFiles(filesToScan);

            if (scanResult.findings.length > 0) {
              statuses['security-scan'] = 'warn';
              for (const f of scanResult.findings) {
                localFindings.push({
                  tool: 'security-scan',
                  file: f.file,
                  line: f.line,
                  ruleId: f.ruleId,
                  message: f.message,
                  severity: f.severity === 'info' ? 'warning' : f.severity,
                });
              }
            } else {
              statuses['security-scan'] = 'pass';
            }
          }
        } catch (err) {
          statuses['security-scan'] = 'warn';
          localFindings.push({
            tool: 'security-scan',
            file: projectRoot,
            message: err instanceof Error ? err.message : String(err),
            severity: 'warning',
          });
        }
        return localFindings;
      })()
    );
  }

  const parallelResults = await Promise.all(parallelChecks);
  for (const result of parallelResults) {
    findings.push(...result);
  }

  // Determine overall status
  const hasErrors = findings.some((f) => f.severity === 'error');
  // Pipeline stops only for validate and check-deps failures
  const stopPipeline = statuses.validate === 'fail' || statuses['check-deps'] === 'fail';

  return Ok({
    pass: !hasErrors,
    stopPipeline,
    findings,
    checks: {
      validate: statuses.validate,
      checkDeps: statuses['check-deps'],
      checkDocs: statuses['check-docs'],
      securityScan: statuses['security-scan'],
    },
  });
}
