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
    'Run CI/CD validation checks on a harness project. Returns pass/fail results per check with issues. Checks: validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability.',
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
