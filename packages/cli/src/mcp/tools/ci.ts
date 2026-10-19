import { sanitizePath } from '../utils/sanitize-path.js';
import { resolveProjectConfig } from '../utils/config-resolver.js';

type CICheckName =
  | 'validate'
  | 'deps'
  | 'docs'
  | 'entropy'
  | 'security'
  | 'perf'
  | 'phase-gate'
  | 'arch'
  | 'traceability';

const VALID_CHECKS: CICheckName[] = [
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

export const runCIChecksDefinition = {
  name: 'run_ci_checks',
  description:
    'Run CI/CD validation checks on a harness project. Returns the full report: per-check ' +
    'status, issues, the summary counts, and `exitCode`. A check with `status: "skip"` and a ' +
    '`skipReason` ABSTAINED — it could not run, so it is counted in `summary.abstained` and ' +
    'forces a non-zero `exitCode`; do not read it as a pass (#2071). A `status: "skip"` with ' +
    'no `skipReason` is a check the caller left out of `checks`. ' +
    'Checks: validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      checks: {
        type: 'array',
        items: {
          type: 'string',
          enum: VALID_CHECKS,
        },
        description: 'Subset of checks to run (default: all)',
      },
    },
    required: ['path'],
  },
};

export async function handleRunCIChecks(input: { path: string; checks?: CICheckName[] }) {
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

  // Resolve project config
  const configResult = resolveProjectConfig(projectPath);
  if (!configResult.ok) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${configResult.error.message}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const { runCIChecks } = await import('@harness-engineering/core');

    const skip: CICheckName[] = input.checks
      ? VALID_CHECKS.filter((c) => !input.checks!.includes(c))
      : [];

    const result = await runCIChecks({
      projectRoot: projectPath,
      config: configResult.value as unknown as Record<string, unknown>,
      ...(skip.length > 0 ? { skip } : {}),
    });

    if (!result.ok) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error: ${result.error.message}`,
          },
        ],
        isError: true,
      };
    }

    // The whole report goes back verbatim — no summarising, no re-deriving a
    // verdict. The abstention fields (`skipReason`, `summary.abstained`,
    // `exitCode`) are the only thing that tells a caller a gate did not run, so
    // this surface must not launder them out (#2071).
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result.value) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error running CI checks: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
