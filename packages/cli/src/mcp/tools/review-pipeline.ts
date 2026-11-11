import { paginate, reportIgnoredClumpingBlock } from '@harness-engineering/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { resolveProjectConfig } from '../utils/config-resolver.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { sortFindingsBySeverity } from '../utils/severity.js';
import { loadGuardianCoverage } from '../../utils/guardian-context.js';
import { buildDiffInfo } from '../../commands/review-ci.js';

/**
 * The project's config, for `runReviewPipeline`'s `config` field.
 *
 * `runReviewPipeline` has three production callers and this was one of two that
 * omitted `config` entirely. The pipeline reads that object for the review
 * seam's clump policy (`pipeline-orchestrator.ts`, Phase 6), so omitting it
 * made the documented escape hatch `clumping.floorEnabled: false` a no-op on
 * the MCP path specifically — the path an agent reaches review through. The
 * goal read as met because the ONE caller that passed it was the one anybody
 * checked.
 *
 * Read from EXACTLY `<projectRoot>/harness.config.json`, the same rule the
 * craft seam follows and for the same reason: `projectRoot` is already the
 * project, so a walk could only find a different project's config and tune this
 * review by it.
 *
 * An ABSENT config is the ordinary case and says nothing. A config that is
 * THERE and will not parse is a degrade, and it is reported rather than
 * swallowed — the swallow is the defect this change already had to fix at three
 * other seams.
 */
function reviewConfigFor(projectRoot: string): { config?: Record<string, unknown> } {
  const loaded = resolveProjectConfig(projectRoot);
  if (loaded.ok) return { config: loaded.value as Record<string, unknown> };
  if (fs.existsSync(path.join(projectRoot, 'harness.config.json'))) {
    reportIgnoredClumpingBlock([loaded.error.message]);
  }
  return {};
}

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

    const projectRoot = sanitizePath(input.path);

    // Build DiffInfo from the raw diff. `parseDiff` returns file metadata only
    // (path/status/counts) — no per-file diff text — so `fileDiffs` must be
    // split from the raw diff, or depth calibration and keyword detection run
    // against empty strings and report `changedLines: 0` (#2213).
    const diffInfo = buildDiffInfo(input.diff);

    // Advisory guardian diff-coverage input (#914): read + render from the
    // project's .harness/analyses/ archive; undefined when absent (degrade-safe).
    const guardianCoverage = await loadGuardianCoverage(projectRoot);

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
      ...reviewConfigFor(projectRoot),
      ...(input.repo != null ? { repo: input.repo } : {}),
      ...(guardianCoverage != null ? { guardianCoverage } : {}),
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
