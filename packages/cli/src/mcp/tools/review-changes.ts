import { sanitizePath } from '../utils/sanitize-path.js';

type Depth = 'quick' | 'standard' | 'deep';
const SIZE_GATE_LINES = 10_000;

const SEVERITY_ORDER: Record<string, number> = {
  error: 0,
  critical: 0,
  warning: 1,
  important: 1,
  info: 2,
  suggestion: 2,
};

function sortFindingsBySeverity(findings: unknown[]): unknown[] {
  return [...findings].sort((a, b) => {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aSev = SEVERITY_ORDER[typeof aObj.severity === 'string' ? aObj.severity : ''] ?? 99;
    const bSev = SEVERITY_ORDER[typeof bObj.severity === 'string' ? bObj.severity : ''] ?? 99;
    return aSev - bSev;
  });
}

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
      offset: {
        type: 'number',
        description:
          'Number of findings to skip (pagination). Default: 0. Findings are sorted by severity desc (error > warning > info).',
      },
      limit: {
        type: 'number',
        description: 'Max findings to return (pagination). Default: 20.',
      },
    },
    required: ['path', 'depth'],
  },
};

async function getDiff(projectPath: string, providedDiff?: string): Promise<string> {
  if (providedDiff) return providedDiff;

  // Auto-detect from git (using execFileSync to avoid shell injection surface)
  const { execFileSync } = await import('child_process');
  try {
    const staged = execFileSync('git', ['diff', '--cached'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10_000,
    });
    if (staged.trim().length > 0) return staged;

    const unstaged = execFileSync('git', ['diff'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10_000,
    });
    if (unstaged.trim().length > 0) return unstaged;

    throw new Error('No diff found -- provide a diff string or have uncommitted changes');
  } catch (error) {
    if (error instanceof Error && error.message.includes('No diff found')) throw error;
    throw new Error(
      `Failed to get diff from git: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

export async function handleReviewChanges(input: {
  path: string;
  diff?: string;
  depth: Depth;
  mode?: 'summary' | 'detailed';
  offset?: number;
  limit?: number;
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
    const reviewFn = DEPTH_HANDLERS[effectiveDepth];
    return await reviewFn(projectPath, diff, diffLines, downgraded, input.offset, input.limit);
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

async function runQuickReview(
  projectPath: string,
  diff: string,
  diffLines: number,
  downgraded: boolean,
  offset?: number,
  limit?: number
) {
  const { handleAnalyzeDiff } = await import('./feedback.js');
  const { paginate } = await import('@harness-engineering/core');
  const result = await handleAnalyzeDiff({ diff, path: projectPath });
  const firstContent = result.content[0];
  if (!firstContent) throw new Error('Empty analyze_diff response');
  const parsed = JSON.parse(firstContent.text);

  const rawFindings = parsed.findings ?? parsed.warnings ?? [];
  const sorted = sortFindingsBySeverity(rawFindings);
  const paged = paginate(sorted, offset ?? 0, limit ?? 20);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          depth: 'quick',
          downgraded,
          findings: paged.items,
          pagination: paged.pagination,
          fileCount: parsed.summary?.filesChanged ?? parsed.files?.length ?? 0,
          lineCount: diffLines,
          ...(result.isError ? { error: parsed } : {}),
        }),
      },
    ],
  };
}

function extractFindings(
  parsed: Record<string, unknown>,
  primaryKey: string,
  fallbackKey: string
): unknown[] {
  return (parsed[primaryKey] ?? parsed[fallbackKey] ?? []) as unknown[];
}

function extractFileCount(diffParsed: Record<string, unknown>): number {
  const summary = diffParsed.summary as Record<string, number> | undefined;
  if (summary?.filesChanged !== undefined) return summary.filesChanged;
  const files = diffParsed.files as unknown[] | undefined;
  return files?.length ?? 0;
}

async function runStandardReview(
  projectPath: string,
  diff: string,
  diffLines: number,
  downgraded: boolean,
  offset?: number,
  limit?: number
) {
  const { handleAnalyzeDiff, handleCreateSelfReview } = await import('./feedback.js');
  const { paginate } = await import('@harness-engineering/core');
  const [diffResult, reviewResult] = await Promise.all([
    handleAnalyzeDiff({ diff, path: projectPath }),
    handleCreateSelfReview({ path: projectPath, diff }),
  ]);

  const diffContent = diffResult.content[0];
  const reviewContent = reviewResult.content[0];
  if (!diffContent || !reviewContent) throw new Error('Empty review response');
  const diffParsed = JSON.parse(diffContent.text);
  const reviewParsed = JSON.parse(reviewContent.text);

  const findings = [
    ...extractFindings(diffParsed, 'findings', 'warnings'),
    ...extractFindings(reviewParsed, 'findings', 'items'),
  ];
  const sorted = sortFindingsBySeverity(findings);
  const paged = paginate(sorted, offset ?? 0, limit ?? 20);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          depth: 'standard',
          downgraded,
          findings: paged.items,
          pagination: paged.pagination,
          diffAnalysis: diffParsed,
          selfReview: reviewParsed,
          fileCount: extractFileCount(diffParsed),
          lineCount: diffLines,
        }),
      },
    ],
  };
}

async function runDeepReview(
  projectPath: string,
  diff: string,
  diffLines: number,
  _downgraded: boolean,
  offset?: number,
  limit?: number
) {
  const { handleRunCodeReview } = await import('./review-pipeline.js');
  const { paginate } = await import('@harness-engineering/core');
  const result = await handleRunCodeReview({ path: projectPath, diff });
  const deepContent = result.content[0];
  if (!deepContent) throw new Error('Empty code review response');
  const parsed = JSON.parse(deepContent.text);

  const rawFindings = parsed.findings ?? [];
  const sorted = sortFindingsBySeverity(rawFindings);
  const paged = paginate(sorted, offset ?? 0, limit ?? 20);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          depth: 'deep',
          downgraded: false,
          findings: paged.items,
          pagination: paged.pagination,
          assessment: parsed.assessment,
          findingCount: parsed.findingCount,
          lineCount: diffLines,
          pipeline: parsed,
        }),
      },
    ],
  };
}

type ReviewHandler = (
  projectPath: string,
  diff: string,
  diffLines: number,
  downgraded: boolean,
  offset?: number,
  limit?: number
) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;

const DEPTH_HANDLERS: Record<Depth, ReviewHandler> = {
  quick: runQuickReview,
  standard: runStandardReview,
  deep: runDeepReview,
};
