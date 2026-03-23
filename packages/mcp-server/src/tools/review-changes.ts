import { sanitizePath } from '../utils/sanitize-path.js';

type Depth = 'quick' | 'standard' | 'deep';
const SIZE_GATE_LINES = 10_000;

export const reviewChangesDefinition = {
  name: 'review_changes',
  description:
    'Review code changes at configurable depth: quick (diff analysis), standard (+ self-review), deep (full 7-phase pipeline). Auto-downgrades deep to standard for diffs > 10k lines.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      diff: {
        type: 'string',
        description: 'Raw git diff string. If omitted, auto-detects from git.',
      },
      depth: {
        type: 'string',
        enum: ['quick', 'standard', 'deep'],
        description: 'Review depth: quick, standard, or deep',
      },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description: 'Response density. Default: summary',
      },
    },
    required: ['path', 'depth'],
  },
};

async function getDiff(projectPath: string, providedDiff?: string): Promise<string> {
  if (providedDiff) return providedDiff;

  // Auto-detect from git
  const { execSync } = await import('child_process');
  try {
    const staged = execSync('git diff --cached', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10_000,
    });
    if (staged.trim().length > 0) return staged;

    const unstaged = execSync('git diff', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10_000,
    });
    if (unstaged.trim().length > 0) return unstaged;

    throw new Error('No diff found -- provide a diff string or have uncommitted changes');
  } catch (error) {
    if (error instanceof Error && error.message.includes('No diff found')) throw error;
    throw new Error(
      `Failed to get diff from git: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function handleReviewChanges(input: {
  path: string;
  diff?: string;
  depth: Depth;
  mode?: 'summary' | 'detailed';
}) {
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

  // Get diff
  let diff: string;
  try {
    diff = await getDiff(projectPath, input.diff);
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

  // Size gate
  const diffLines = diff.split('\n').length;
  let effectiveDepth: Depth = input.depth;
  let downgraded = false;
  if (effectiveDepth === 'deep' && diffLines > SIZE_GATE_LINES) {
    effectiveDepth = 'standard';
    downgraded = true;
  }

  try {
    if (effectiveDepth === 'quick') {
      // analyze_diff only
      const { handleAnalyzeDiff } = await import('./feedback.js');
      const result = await handleAnalyzeDiff({ diff, path: projectPath });
      const parsed = JSON.parse(result.content[0].text);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              depth: 'quick',
              downgraded,
              findings: parsed.findings ?? parsed.warnings ?? [],
              fileCount: parsed.summary?.filesChanged ?? parsed.files?.length ?? 0,
              lineCount: diffLines,
              ...(result.isError ? { error: parsed } : {}),
            }),
          },
        ],
      };
    }

    if (effectiveDepth === 'standard') {
      // analyze_diff + create_self_review
      const { handleAnalyzeDiff, handleCreateSelfReview } = await import('./feedback.js');

      const [diffResult, reviewResult] = await Promise.all([
        handleAnalyzeDiff({ diff, path: projectPath }),
        handleCreateSelfReview({ path: projectPath, diff }),
      ]);

      const diffParsed = JSON.parse(diffResult.content[0].text);
      const reviewParsed = JSON.parse(reviewResult.content[0].text);

      // Merge findings
      const findings = [
        ...(diffParsed.findings ?? diffParsed.warnings ?? []),
        ...(reviewParsed.findings ?? reviewParsed.items ?? []),
      ];

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              depth: 'standard',
              downgraded,
              findings,
              diffAnalysis: diffParsed,
              selfReview: reviewParsed,
              fileCount: diffParsed.summary?.filesChanged ?? diffParsed.files?.length ?? 0,
              lineCount: diffLines,
            }),
          },
        ],
      };
    }

    // deep -- full pipeline
    const { handleRunCodeReview } = await import('./review-pipeline.js');
    const result = await handleRunCodeReview({ path: projectPath, diff });
    const parsed = JSON.parse(result.content[0].text);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            depth: 'deep',
            downgraded: false,
            findings: parsed.findings ?? [],
            assessment: parsed.assessment,
            findingCount: parsed.findingCount,
            lineCount: diffLines,
            pipeline: parsed,
          }),
        },
      ],
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
