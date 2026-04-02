import { sanitizePath } from '../utils/sanitize-path.js';

type CheckName = 'validate' | 'deps' | 'docs' | 'entropy' | 'security' | 'perf' | 'lint';

export const assessProjectDefinition = {
  name: 'assess_project',
  description:
    'Run all project health checks in parallel and return a unified report. Checks: validate, dependencies, docs, entropy, security, performance, lint.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      checks: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['validate', 'deps', 'docs', 'entropy', 'security', 'perf', 'lint'],
        },
        description: 'Which checks to run (default: all)',
      },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description: 'Response density. Default: summary',
      },
    },
    required: ['path'],
  },
};

interface CheckResult {
  name: string;
  passed: boolean;
  issueCount: number;
  topIssue?: string;
  detailed?: unknown;
}

export async function handleAssessProject(input: {
  path: string;
  checks?: CheckName[];
  mode?: 'summary' | 'detailed';
}) {
  const start = Date.now();

  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }

  const checksToRun = new Set<CheckName>(
    input.checks ?? ['validate', 'deps', 'docs', 'entropy', 'security', 'perf', 'lint']
  );
  const mode = input.mode ?? 'summary';

  // Phase 1: validate first (config needed by deps)
  let validateResult: CheckResult | null = null;
  if (checksToRun.has('validate')) {
    try {
      const { handleValidateProject } = await import('./validate.js');
      const result = await handleValidateProject({ path: projectPath });
      const first = result.content[0];
      const parsed = first ? JSON.parse(first.text) : {};
      validateResult = {
        name: 'validate',
        passed: parsed.valid === true,
        issueCount: parsed.errors?.length ?? 0,
        ...(parsed.errors?.length > 0 ? { topIssue: parsed.errors[0] } : {}),
        ...(mode === 'detailed' ? { detailed: parsed } : {}),
      };
    } catch (error) {
      validateResult = {
        name: 'validate',
        passed: false,
        issueCount: 1,
        topIssue: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Phase 2: all other checks in parallel
  const parallelChecks: Array<Promise<CheckResult>> = [];

  if (checksToRun.has('deps')) {
    parallelChecks.push(
      (async (): Promise<CheckResult> => {
        try {
          const { handleCheckDependencies } = await import('./architecture.js');
          const result = await handleCheckDependencies({ path: projectPath });
          const first = result.content[0];
          const parsed = first ? JSON.parse(first.text) : {};
          const violations = parsed.violations ?? [];
          return {
            name: 'deps',
            passed: !result.isError && violations.length === 0,
            issueCount: violations.length,
            ...(violations.length > 0
              ? { topIssue: violations[0]?.message ?? String(violations[0]) }
              : {}),
            ...(mode === 'detailed' ? { detailed: parsed } : {}),
          };
        } catch (error) {
          return {
            name: 'deps',
            passed: false,
            issueCount: 1,
            topIssue: error instanceof Error ? error.message : String(error),
          };
        }
      })()
    );
  }

  if (checksToRun.has('docs')) {
    parallelChecks.push(
      (async (): Promise<CheckResult> => {
        try {
          const { handleCheckDocs } = await import('./docs.js');
          const result = await handleCheckDocs({ path: projectPath, scope: 'coverage' });
          const first = result.content[0];
          const parsed = first ? JSON.parse(first.text) : {};
          const undocumented = parsed.undocumented ?? parsed.files?.undocumented ?? [];
          return {
            name: 'docs',
            passed: !result.isError,
            issueCount: Array.isArray(undocumented) ? undocumented.length : 0,
            ...(Array.isArray(undocumented) && undocumented.length > 0
              ? { topIssue: `Undocumented: ${undocumented[0]}` }
              : {}),
            ...(mode === 'detailed' ? { detailed: parsed } : {}),
          };
        } catch (error) {
          return {
            name: 'docs',
            passed: false,
            issueCount: 1,
            topIssue: error instanceof Error ? error.message : String(error),
          };
        }
      })()
    );
  }

  if (checksToRun.has('entropy')) {
    parallelChecks.push(
      (async (): Promise<CheckResult> => {
        try {
          const { handleDetectEntropy } = await import('./entropy.js');
          const result = await handleDetectEntropy({ path: projectPath, type: 'all' });
          const first = result.content[0];
          const parsed = first ? JSON.parse(first.text) : {};
          const issues =
            (parsed.drift?.staleReferences?.length ?? 0) +
            (parsed.drift?.missingTargets?.length ?? 0) +
            (parsed.deadCode?.unusedImports?.length ?? 0) +
            (parsed.deadCode?.unusedExports?.length ?? 0) +
            (parsed.patterns?.violations?.length ?? 0);
          return {
            name: 'entropy',
            passed: !('isError' in result && result.isError) && issues === 0,
            issueCount: issues,
            ...(issues > 0
              ? { topIssue: 'Entropy detected -- run detect_entropy for details' }
              : {}),
            ...(mode === 'detailed' ? { detailed: parsed } : {}),
          };
        } catch (error) {
          return {
            name: 'entropy',
            passed: false,
            issueCount: 1,
            topIssue: error instanceof Error ? error.message : String(error),
          };
        }
      })()
    );
  }

  if (checksToRun.has('security')) {
    parallelChecks.push(
      (async (): Promise<CheckResult> => {
        try {
          const { handleRunSecurityScan } = await import('./security.js');
          const result = await handleRunSecurityScan({ path: projectPath });
          const first = result.content[0];
          const parsed = first ? JSON.parse(first.text) : {};
          const findings = parsed.findings ?? [];
          const errorCount = findings.filter(
            (f: { severity: string }) => f.severity === 'error'
          ).length;
          return {
            name: 'security',
            passed: !result.isError && errorCount === 0,
            issueCount: findings.length,
            ...(findings.length > 0
              ? {
                  topIssue: `${findings[0]?.rule ?? findings[0]?.type ?? 'finding'}: ${findings[0]?.message ?? ''}`,
                }
              : {}),
            ...(mode === 'detailed' ? { detailed: parsed } : {}),
          };
        } catch (error) {
          return {
            name: 'security',
            passed: false,
            issueCount: 1,
            topIssue: error instanceof Error ? error.message : String(error),
          };
        }
      })()
    );
  }

  if (checksToRun.has('perf')) {
    parallelChecks.push(
      (async (): Promise<CheckResult> => {
        try {
          const { handleCheckPerformance } = await import('./performance.js');
          const result = await handleCheckPerformance({ path: projectPath });
          if ('isError' in result && result.isError) {
            const msg = result.content[0]?.text ?? 'Performance check failed';
            return { name: 'perf', passed: false, issueCount: 1, topIssue: msg };
          }
          const first = result.content[0];
          let parsed: Record<string, unknown> = {};
          try {
            parsed = first ? JSON.parse(first.text) : {};
          } catch {
            return {
              name: 'perf',
              passed: false,
              issueCount: 1,
              topIssue: first?.text ?? 'Invalid perf output',
            };
          }
          const issues =
            (parsed.violations as unknown[] | undefined)?.length ??
            (parsed.issues as unknown[] | undefined)?.length ??
            0;
          return {
            name: 'perf',
            passed: issues === 0,
            issueCount: issues,
            ...(issues > 0 ? { topIssue: 'Performance issues detected' } : {}),
            ...(mode === 'detailed' ? { detailed: parsed } : {}),
          };
        } catch (error) {
          return {
            name: 'perf',
            passed: false,
            issueCount: 1,
            topIssue: error instanceof Error ? error.message : String(error),
          };
        }
      })()
    );
  }

  if (checksToRun.has('lint')) {
    parallelChecks.push(
      (async (): Promise<CheckResult> => {
        try {
          const { execFileSync } = await import('child_process');
          const output = execFileSync('npx', ['turbo', 'run', 'lint', '--force'], {
            cwd: projectPath,
            encoding: 'utf-8',
            timeout: 60_000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          return {
            name: 'lint',
            passed: true,
            issueCount: 0,
            ...(mode === 'detailed' ? { detailed: output } : {}),
          };
        } catch (error) {
          const stderr =
            error && typeof error === 'object' && 'stderr' in error
              ? String((error as { stderr: unknown }).stderr)
              : '';
          const stdout =
            error && typeof error === 'object' && 'stdout' in error
              ? String((error as { stdout: unknown }).stdout)
              : '';
          const combined = (stderr + '\n' + stdout).trim();
          // Count error lines from eslint output
          const errorMatch = combined.match(/(\d+) error/);
          const issueCount = errorMatch?.[1] ? parseInt(errorMatch[1], 10) : 1;
          // Extract first error line for topIssue
          const firstError = combined.split('\n').find((line) => line.includes('error'));
          return {
            name: 'lint',
            passed: false,
            issueCount,
            topIssue:
              firstError?.trim() ?? (error instanceof Error ? error.message : String(error)),
            ...(mode === 'detailed' ? { detailed: combined } : {}),
          };
        }
      })()
    );
  }

  const parallelResults = await Promise.all(parallelChecks);

  const allChecks: CheckResult[] = [];
  if (validateResult) allChecks.push(validateResult);
  allChecks.push(...parallelResults);

  const healthy = allChecks.every((c) => c.passed);
  const assessedIn = Date.now() - start;

  if (mode === 'summary') {
    // Strip detailed field from summary output
    const summaryChecks = allChecks.map(({ detailed: _d, ...rest }) => rest);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ healthy, checks: summaryChecks, assessedIn }),
        },
      ],
    };
  }

  // detailed mode
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ healthy, checks: allChecks, assessedIn }),
      },
    ],
  };
}
