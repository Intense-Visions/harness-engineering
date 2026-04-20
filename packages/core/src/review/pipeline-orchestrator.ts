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
  EvidenceCoverageReport,
  ContextBundle,
  Rubric,
  ReviewDomain,
} from './types';
import { checkEligibility } from './eligibility-gate';
import { runMechanicalChecks } from './mechanical-checks';
import { buildExclusionSet, ExclusionSet } from './exclusion-set';
import { scopeContext } from './context-scoper';
import { fanOutReview } from './fan-out';
import { validateFindings } from './validate-findings';
import { deduplicateFindings } from './deduplicate-findings';
import { generateRubric } from './meta-judge';
import { splitBundlesByStage } from './two-stage';
import {
  formatTerminalOutput,
  formatGitHubComment,
  determineAssessment,
  getExitCode,
} from './output';
import { checkEvidenceCoverage, tagUncitedFindings } from './evidence-gate';
import { computeTrustScores } from './trust-score';
import { readSessionSection } from '../state/session-sections';

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
  /** Session slug for loading evidence entries (optional) */
  sessionSlug?: string;
  /**
   * Per-domain accuracy overrides for trust scoring (optional).
   * When provided, replaces the static DOMAIN_BASELINES for the historical
   * accuracy factor. Callers can derive these from PersonaEffectiveness
   * scores in the intelligence package.
   */
  domainAccuracy?: Partial<Record<ReviewDomain, number>>;
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
    sessionSlug,
    domainAccuracy,
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

  // --- Phase 2.5: META-JUDGE RUBRIC (thorough mode only) ---
  // Generated BEFORE the agents see the implementation. The generator
  // is only given diff metadata + commit message — never file contents.
  let rubric: Rubric | undefined;
  if (flags.thorough) {
    try {
      rubric = await generateRubric({ diff, commitMessage });
    } catch {
      // Rubric generation is advisory — never block the pipeline on failure.
      rubric = undefined;
    }
  }

  // --- Phase 3: CONTEXT ---
  let contextBundles: ContextBundle[];
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
    contextBundles = (['compliance', 'bug', 'security', 'architecture', 'learnings'] as const).map(
      (domain) => ({
        domain,
        changeType: 'feature' as const,
        changedFiles: [],
        contextFiles: [],
        commitHistory: [],
        diffLines: diff.totalDiffLines,
        contextLines: 0,
      })
    );
  }

  // Attach rubric to every bundle so agents can reference it.
  if (rubric) {
    contextBundles = contextBundles.map((b) => ({ ...b, rubric }));
  }

  // --- Phase 4: FAN-OUT ---
  // In isolated mode, run fan-out twice with disjoint context bundles:
  // spec-compliance first (compliance + architecture see the spec),
  // then code-quality (bug + security do NOT see the spec).
  let agentResults;
  if (flags.isolated) {
    const specBundles = splitBundlesByStage(contextBundles, 'spec-compliance');
    const qualityBundles = splitBundlesByStage(contextBundles, 'code-quality');
    const [specResults, qualityResults] = await Promise.all([
      fanOutReview({ bundles: specBundles }),
      fanOutReview({ bundles: qualityBundles }),
    ]);
    agentResults = [...specResults, ...qualityResults];
  } else {
    agentResults = await fanOutReview({ bundles: contextBundles });
  }
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

  // --- Phase 5.5: TRUST SCORING ---
  const scoredFindings = computeTrustScores(
    validatedFindings,
    domainAccuracy ? { domainAccuracy } : undefined
  );

  // --- Evidence Check (between Phase 5.5 and Phase 6) ---
  let evidenceCoverage: EvidenceCoverageReport | undefined;
  if (sessionSlug) {
    try {
      const evidenceResult = await readSessionSection(projectRoot, sessionSlug, 'evidence');
      if (evidenceResult.ok) {
        evidenceCoverage = checkEvidenceCoverage(scoredFindings, evidenceResult.value);
        tagUncitedFindings(scoredFindings, evidenceResult.value);
      }
    } catch {
      // Evidence checking is optional — continue without it
    }
  }

  // --- Phase 6: DEDUP+MERGE ---
  const dedupedFindings = deduplicateFindings({ findings: scoredFindings });

  // --- Phase 7: OUTPUT ---
  const strengths: ReviewStrength[] = [];
  const assessment = determineAssessment(dedupedFindings);
  const exitCode = getExitCode(assessment);

  const terminalOutput = formatTerminalOutput({
    findings: dedupedFindings,
    strengths,
    ...(evidenceCoverage != null ? { evidenceCoverage } : {}),
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
    ...(mechanicalResult != null ? { mechanicalResult } : {}),
    ...(evidenceCoverage != null ? { evidenceCoverage } : {}),
  };
}
