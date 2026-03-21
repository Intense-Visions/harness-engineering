import type {
  PipelineFlags,
  ReviewPipelineResult,
  DiffInfo,
  PrMetadata,
  GraphAdapter,
  ModelTierConfig,
  ReviewFinding,
  ReviewStrength,
  GitHubInlineComment,
  MechanicalCheckResult,
  CommitHistoryEntry,
} from './types';
import { checkEligibility } from './eligibility-gate';
import { runMechanicalChecks } from './mechanical-checks';
import { buildExclusionSet, ExclusionSet } from './exclusion-set';
import { scopeContext } from './context-scoper';
import { fanOutReview } from './fan-out';
import { validateFindings } from './validate-findings';
import { deduplicateFindings } from './deduplicate-findings';
import {
  formatTerminalOutput,
  formatGitHubComment,
  determineAssessment,
  getExitCode,
} from './output';

/**
 * Options for invoking the pipeline.
 */
export interface RunPipelineOptions {
  projectRoot: string;
  diff: DiffInfo;
  commitMessage: string;
  flags: PipelineFlags;
  modelTierConfig?: ModelTierConfig;
  graph?: GraphAdapter;
  prMetadata?: PrMetadata;
  conventionFiles?: string[];
  checkDepsOutput?: string;
  repo?: string;
  /** Harness config object for mechanical checks */
  config?: Record<string, unknown>;
  /** Pre-gathered commit history entries */
  commitHistory?: CommitHistoryEntry[];
}

/**
 * Run the full 7-phase code review pipeline.
 *
 * Phase 1: GATE (CI mode only)
 * Phase 2: MECHANICAL (skipped with --no-mechanical)
 * Phase 3: CONTEXT
 * Phase 4: FAN-OUT (parallel agents)
 * Phase 5: VALIDATE
 * Phase 6: DEDUP+MERGE
 * Phase 7: OUTPUT
 */
export async function runReviewPipeline(
  options: RunPipelineOptions
): Promise<ReviewPipelineResult> {
  const {
    projectRoot,
    diff,
    commitMessage,
    flags,
    graph,
    prMetadata,
    conventionFiles,
    checkDepsOutput,
    config = {},
    commitHistory,
  } = options;

  // --- Phase 1: GATE ---
  if (flags.ci && prMetadata) {
    const eligibility = checkEligibility(prMetadata, true);
    if (!eligibility.eligible) {
      return {
        skipped: true,
        ...(eligibility.reason != null ? { skipReason: eligibility.reason } : {}),
        stoppedByMechanical: false,
        findings: [],
        strengths: [],
        terminalOutput: `Review skipped: ${eligibility.reason ?? 'ineligible'}`,
        githubComments: [],
        exitCode: 0,
      };
    }
  }

  // --- Phase 2: MECHANICAL ---
  let mechanicalResult: MechanicalCheckResult | undefined;
  let exclusionSet: ExclusionSet;

  if (flags.noMechanical) {
    exclusionSet = buildExclusionSet([]);
  } else {
    try {
      const mechResult = await runMechanicalChecks({
        projectRoot,
        config,
        changedFiles: diff.changedFiles,
      });

      if (mechResult.ok) {
        mechanicalResult = mechResult.value;
        exclusionSet = buildExclusionSet(mechResult.value.findings);

        if (mechResult.value.stopPipeline) {
          // Format mechanical failures as terminal output
          const mechFindings = mechResult.value.findings
            .filter((f) => f.severity === 'error')
            .map((f) => `  x ${f.tool}: ${f.file}${f.line ? `:${f.line}` : ''} - ${f.message}`)
            .join('\n');

          const terminalOutput = [
            '## Strengths\n',
            '  No AI review performed (mechanical checks failed).\n',
            '## Issues\n',
            '### Critical (mechanical)\n',
            mechFindings,
            '\n## Assessment: Request Changes\n',
            '  Mechanical checks must pass before AI review.',
          ].join('\n');

          return {
            skipped: false,
            stoppedByMechanical: true,
            assessment: 'request-changes',
            findings: [],
            strengths: [],
            terminalOutput,
            githubComments: [],
            exitCode: 1,
            mechanicalResult,
          };
        }
      } else {
        // Mechanical checks threw an error -- proceed with empty exclusion set
        exclusionSet = buildExclusionSet([]);
      }
    } catch {
      // Mechanical checks failed to run -- proceed with empty exclusion set
      exclusionSet = buildExclusionSet([]);
    }
  }

  // --- Phase 3: CONTEXT ---
  let contextBundles;
  try {
    contextBundles = await scopeContext({
      projectRoot,
      diff,
      commitMessage,
      ...(graph != null ? { graph } : {}),
      ...(conventionFiles != null ? { conventionFiles } : {}),
      ...(checkDepsOutput != null ? { checkDepsOutput } : {}),
      ...(commitHistory != null ? { commitHistory } : {}),
    });
  } catch {
    // Context scoping failed -- create minimal bundles
    contextBundles = (['compliance', 'bug', 'security', 'architecture'] as const).map((domain) => ({
      domain,
      changeType: 'feature' as const,
      changedFiles: [],
      contextFiles: [],
      commitHistory: [],
      diffLines: diff.totalDiffLines,
      contextLines: 0,
    }));
  }

  // --- Phase 4: FAN-OUT ---
  const agentResults = await fanOutReview({ bundles: contextBundles });
  const rawFindings: ReviewFinding[] = agentResults.flatMap((r) => r.findings);

  // --- Phase 5: VALIDATE ---
  const fileContents = new Map<string, string>();
  for (const [file, content] of diff.fileDiffs) {
    fileContents.set(file, content);
  }

  const validatedFindings = await validateFindings({
    findings: rawFindings,
    exclusionSet,
    ...(graph != null ? { graph } : {}),
    projectRoot,
    fileContents,
  });

  // --- Phase 6: DEDUP+MERGE ---
  const dedupedFindings = deduplicateFindings({ findings: validatedFindings });

  // --- Phase 7: OUTPUT ---
  const strengths: ReviewStrength[] = [];
  const assessment = determineAssessment(dedupedFindings);
  const exitCode = getExitCode(assessment);

  const terminalOutput = formatTerminalOutput({
    findings: dedupedFindings,
    strengths,
  });

  let githubComments: GitHubInlineComment[] = [];
  if (flags.comment) {
    githubComments = dedupedFindings.map((f) => formatGitHubComment(f));
  }

  return {
    skipped: false,
    stoppedByMechanical: false,
    assessment,
    findings: dedupedFindings,
    strengths,
    terminalOutput,
    githubComments,
    exitCode,
    ...(mechanicalResult !== undefined ? { mechanicalResult } : {}),
  };
}
