import { paginate } from '@harness-engineering/core';
import { sanitizePath } from '../utils/sanitize-path.js';
import { sortFindingsBySeverity } from '../utils/severity.js';

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
      depth: {
        type: 'string',
        enum: ['quick', 'standard', 'deep'],
        description:
          'Override Phase 3.5 depth calibration. "deep" forces all conditional subagents (adversarial, typescript-strict, frontend-races).',
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
  depth?: 'quick' | 'standard' | 'deep';
  prNumber?: number;
  repo?: string;
  offset?: number;
  limit?: number;
  /** Internal flag: skip pagination and return all findings. Not exposed in MCP schema. */
  _skipPagination?: boolean;
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
        ...(input.depth != null ? { depth: input.depth } : {}),
      },
      ...(input.repo != null ? { repo: input.repo } : {}),
    });

    const sortedFindings = sortFindingsBySeverity(
      result.findings as unknown[]
    ) as typeof result.findings;

    if (input._skipPagination) {
      // Internal callers (e.g. runDeepReview) need all findings before re-paginating
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              skipped: result.skipped,
              skipReason: result.skipReason,
              stoppedByMechanical: result.stoppedByMechanical,
              assessment: result.assessment,
              findings: sortedFindings,
              findingCount: sortedFindings.length,
              depthCalibration: result.depthCalibration
                ? {
                    depth: result.depthCalibration.depth,
                    changedLines: result.depthCalibration.changedLines,
                    riskSignals: result.depthCalibration.riskSignals,
                    activations: [...result.depthCalibration.activations],
                    overridden: result.depthCalibration.overridden,
                  }
                : undefined,
              terminalOutput: result.terminalOutput,
              githubCommentCount: result.githubComments.length,
              exitCode: result.exitCode,
            }),
          },
        ],
      };
    }

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
              depthCalibration: result.depthCalibration
                ? {
                    depth: result.depthCalibration.depth,
                    changedLines: result.depthCalibration.changedLines,
                    riskSignals: result.depthCalibration.riskSignals,
                    activations: [...result.depthCalibration.activations],
                    overridden: result.depthCalibration.overridden,
                  }
                : undefined,
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
