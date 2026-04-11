import { sanitizePath } from '../utils/sanitize-path.js';

const FINDING_SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  important: 1,
  suggestion: 2,
};

// ============ run_code_review ============

export const runCodeReviewDefinition = {
  name: 'run_code_review',
  description:
    'Run the unified 7-phase code review pipeline: gate, mechanical checks, context scoping, parallel agents, validation, deduplication, and output.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      diff: { type: 'string', description: 'Git diff string to review' },
      commitMessage: {
        type: 'string',
        description: 'Most recent commit message (for change-type detection)',
      },
      comment: {
        type: 'boolean',
        description: 'Post inline comments to GitHub PR (requires prNumber and repo)',
      },
      ci: {
        type: 'boolean',
        description: 'Enable eligibility gate and non-interactive output',
      },
      deep: {
        type: 'boolean',
        description: 'Add threat modeling pass to security agent',
      },
      noMechanical: {
        type: 'boolean',
        description: 'Skip mechanical checks (useful if already run)',
      },
      prNumber: {
        type: 'number',
        description: 'PR number (required for --comment and CI gate)',
      },
      repo: {
        type: 'string',
        description: 'Repository in owner/repo format (required for --comment)',
      },
      offset: {
        type: 'number',
        description:
          'Number of findings to skip (pagination). Default: 0. Findings are sorted by severity desc (critical > important > suggestion).',
      },
      limit: {
        type: 'number',
        description: 'Max findings to return (pagination). Default: 20.',
      },
    },
    required: ['path', 'diff'],
  },
};

export async function handleRunCodeReview(input: {
  path: string;
  diff: string;
  commitMessage?: string;
  comment?: boolean;
  ci?: boolean;
  deep?: boolean;
  noMechanical?: boolean;
  prNumber?: number;
  repo?: string;
  offset?: number;
  limit?: number;
}) {
  try {
    const { parseDiff, runReviewPipeline } = await import('@harness-engineering/core');

    const parseResult = parseDiff(input.diff);
    if (!parseResult.ok) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error parsing diff: ${parseResult.error.message}`,
          },
        ],
        isError: true,
      };
    }

    const codeChanges = parseResult.value;
    const projectRoot = sanitizePath(input.path);

    // Build DiffInfo from parsed diff
    const diffInfo = {
      changedFiles: codeChanges.files.map((f: { path: string }) => f.path),
      newFiles: codeChanges.files
        .filter((f: { path: string; status?: string }) => f.status === 'added')
        .map((f: { path: string }) => f.path),
      deletedFiles: codeChanges.files
        .filter((f: { path: string; status?: string }) => f.status === 'deleted')
        .map((f: { path: string }) => f.path),
      totalDiffLines: input.diff.split('\n').length,
      fileDiffs: new Map(
        codeChanges.files.map((f: { path: string; diff?: string }) => [f.path, f.diff ?? ''])
      ),
    };

    const result = await runReviewPipeline({
      projectRoot,
      diff: diffInfo,
      commitMessage: input.commitMessage ?? '',
      flags: {
        comment: input.comment ?? false,
        ci: input.ci ?? false,
        deep: input.deep ?? false,
        noMechanical: input.noMechanical ?? false,
      },
      ...(input.repo != null ? { repo: input.repo } : {}),
    });

    const { paginate } = await import('@harness-engineering/core');

    // Sort findings by severity desc before pagination
    const sortedFindings = [...result.findings].sort(
      (a, b) =>
        (FINDING_SEVERITY_ORDER[a.severity] ?? 99) - (FINDING_SEVERITY_ORDER[b.severity] ?? 99)
    );

    const paged = paginate(sortedFindings, input.offset ?? 0, input.limit ?? 20);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              skipped: result.skipped,
              skipReason: result.skipReason,
              stoppedByMechanical: result.stoppedByMechanical,
              assessment: result.assessment,
              findings: paged.items,
              findingCount: result.findings.length,
              pagination: paged.pagination,
              terminalOutput: result.terminalOutput,
              githubCommentCount: result.githubComments.length,
              exitCode: result.exitCode,
            },
            null,
            2
          ),
        },
      ],
      isError: false,
    };
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
}
