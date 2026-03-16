import * as path from 'path';
import { resultToMcpResponse } from '../utils/result-adapter.js';

// ============ create_self_review ============

export const createSelfReviewDefinition = {
  name: 'create_self_review',
  description:
    'Generate a checklist-based code review from a git diff, checking harness constraints, custom rules, and diff patterns',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      diff: { type: 'string', description: 'Git diff string to review' },
      customRules: {
        type: 'array',
        items: { type: 'object' },
        description: 'Optional custom rules to apply during review',
      },
      maxFileSize: {
        type: 'number',
        description: 'Maximum number of lines changed per file before flagging',
      },
      maxFileCount: {
        type: 'number',
        description: 'Maximum number of changed files before flagging',
      },
    },
    required: ['path', 'diff'],
  },
};

export async function handleCreateSelfReview(input: {
  path: string;
  diff: string;
  customRules?: Array<Record<string, unknown>>;
  maxFileSize?: number;
  maxFileCount?: number;
}) {
  try {
    const { parseDiff, createSelfReview } = await import('@harness-engineering/core');

    const parseResult = parseDiff(input.diff);
    if (!parseResult.ok) {
      return resultToMcpResponse(parseResult);
    }

    const config = {
      rootDir: path.resolve(input.path),
      harness: {
        context: true,
        constraints: true,
        entropy: true,
      },
      ...(input.customRules ? { customRules: input.customRules } : {}),
      diffAnalysis: {
        enabled: true,
        ...(input.maxFileSize !== undefined ? { maxFileSize: input.maxFileSize } : {}),
        ...(input.maxFileCount !== undefined ? { maxChangedFiles: input.maxFileCount } : {}),
      },
    };

    const result = await createSelfReview(parseResult.value, config);
    return resultToMcpResponse(result);
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

// ============ analyze_diff ============

export const analyzeDiffDefinition = {
  name: 'analyze_diff',
  description:
    'Parse a git diff and check for forbidden patterns, oversized files, and missing test coverage',
  inputSchema: {
    type: 'object' as const,
    properties: {
      diff: { type: 'string', description: 'Git diff string to analyze' },
      forbiddenPatterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of regex patterns that are forbidden in the diff',
      },
      maxFileSize: {
        type: 'number',
        description: 'Maximum number of lines changed per file before flagging',
      },
      maxFileCount: {
        type: 'number',
        description: 'Maximum number of changed files before flagging',
      },
    },
    required: ['diff'],
  },
};

export async function handleAnalyzeDiff(input: {
  diff: string;
  forbiddenPatterns?: string[];
  maxFileSize?: number;
  maxFileCount?: number;
}) {
  try {
    const { parseDiff, analyzeDiff } = await import('@harness-engineering/core');

    const parseResult = parseDiff(input.diff);
    if (!parseResult.ok) {
      return resultToMcpResponse(parseResult);
    }

    const options = {
      enabled: true,
      ...(input.forbiddenPatterns
        ? {
            forbiddenPatterns: input.forbiddenPatterns.map((pattern) => ({
              pattern,
              message: `Forbidden pattern matched: ${pattern}`,
              severity: 'warning' as const,
            })),
          }
        : {}),
      ...(input.maxFileSize !== undefined ? { maxFileSize: input.maxFileSize } : {}),
      ...(input.maxFileCount !== undefined ? { maxChangedFiles: input.maxFileCount } : {}),
    };

    const result = await analyzeDiff(parseResult.value, options);
    return resultToMcpResponse(result);
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

// ============ request_peer_review ============

export const requestPeerReviewDefinition = {
  name: 'request_peer_review',
  description:
    'Spawn an agent subprocess to perform code review. Returns structured feedback with approval status. Timeout: 120 seconds.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      agentType: {
        type: 'string',
        enum: [
          'architecture-enforcer',
          'documentation-maintainer',
          'test-reviewer',
          'entropy-cleaner',
          'custom',
        ],
        description: 'Type of agent to use for the peer review',
      },
      diff: { type: 'string', description: 'Git diff string to review' },
      context: { type: 'string', description: 'Optional additional context for the reviewer' },
    },
    required: ['path', 'agentType', 'diff'],
  },
};

export async function handleRequestPeerReview(input: {
  path: string;
  agentType:
    | 'architecture-enforcer'
    | 'documentation-maintainer'
    | 'test-reviewer'
    | 'entropy-cleaner'
    | 'custom';
  diff: string;
  context?: string;
}) {
  try {
    const { parseDiff, requestPeerReview } = await import('@harness-engineering/core');

    const parseResult = parseDiff(input.diff);
    if (!parseResult.ok) {
      return resultToMcpResponse(parseResult);
    }

    const reviewContext = {
      files: parseResult.value.files.map((f) => f.path),
      diff: input.diff,
      ...(input.context ? { metadata: { context: input.context } } : {}),
    };

    const result = await requestPeerReview(input.agentType, reviewContext, {
      timeout: 120_000,
      wait: true,
    });

    return resultToMcpResponse(result);
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
