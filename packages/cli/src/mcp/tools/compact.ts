import {
  CompactionPipeline,
  StructuralStrategy,
  TruncationStrategy,
  estimateTokens,
  serializeEnvelope,
} from '@harness-engineering/core';
import type { PackedEnvelope } from '@harness-engineering/core';
import { sanitizePath } from '../utils/sanitize-path.js';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

const DEFAULT_TOKEN_BUDGET = 2000;

type StrategyName = 'structural' | 'truncate' | 'pack' | 'semantic';

export const compactToolDefinition = {
  name: 'compact',
  description:
    'Compact content, resolve intents into aggregated packed responses, or re-compress prior tool output. Returns a packed envelope with source attribution and reduction metadata.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      content: {
        type: 'string',
        description: 'Content string to compact directly (Mode A)',
      },
      intent: {
        type: 'string',
        description: 'Intent description — aggregates context via graph search then packs (Mode B)',
      },
      ref: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source label for attribution' },
          content: { type: 'string', description: 'Content to re-compress' },
        },
        required: ['source', 'content'],
        description: 'Re-compress prior tool output with source attribution (Mode C)',
      },
      strategies: {
        type: 'array',
        items: { type: 'string', enum: ['structural', 'truncate', 'pack', 'semantic'] },
        description: 'Strategies to apply (default: structural + truncate)',
      },
      tokenBudget: {
        type: 'number',
        description: 'Token budget for compacted output (default: 2000)',
      },
    },
    required: ['path'],
  },
};

/** Build a CompactionPipeline from strategy names. */
function buildPipeline(strategies?: StrategyName[]): CompactionPipeline {
  const names = strategies ?? ['structural', 'truncate'];
  const instances = names
    .map((name) => {
      switch (name) {
        case 'structural':
          return new StructuralStrategy();
        case 'truncate':
          return new TruncationStrategy();
        case 'pack':
          // Pack strategy: Phase 4 — treated as structural for now
          return new StructuralStrategy();
        case 'semantic':
          // Semantic strategy: future work — treated as structural for now
          return new StructuralStrategy();
        default:
          return null;
      }
    })
    .filter(Boolean) as Array<InstanceType<typeof StructuralStrategy | typeof TruncationStrategy>>;

  return new CompactionPipeline(instances);
}

/** Build a PackedEnvelope from compacted sections. */
function buildEnvelope(
  originalContent: string,
  compactedSections: Array<{ source: string; content: string }>,
  strategyNames: string[],
  cached: boolean
): PackedEnvelope {
  const originalTokens = estimateTokens(originalContent);
  const compactedTokens = compactedSections.reduce((sum, s) => sum + estimateTokens(s.content), 0);
  const reductionPct =
    originalTokens > 0 ? Math.round((1 - compactedTokens / originalTokens) * 100) : 0;

  return {
    meta: {
      strategy: strategyNames,
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: compactedTokens,
      reductionPct,
      cached,
    },
    sections: compactedSections,
  };
}

/** Mode A: compact provided content string directly. */
function handleContentMode(
  content: string,
  pipeline: CompactionPipeline,
  budget: number,
  source: string
): ToolResult {
  const compacted = pipeline.apply(content, budget);
  const envelope = buildEnvelope(
    content,
    [{ source, content: compacted }],
    pipeline.strategyNames,
    false
  );
  return {
    content: [{ type: 'text' as const, text: serializeEnvelope(envelope) }],
  };
}

/** Mode B: intent — aggregate via graph then pack. */
async function handleIntentMode(
  projectPath: string,
  intent: string,
  pipeline: CompactionPipeline,
  budget: number,
  filterContent?: string
): Promise<ToolResult> {
  // Phase 4 stub: check for cached PackedSummary node (always miss)
  // TODO(Phase 4): const cached = await checkPackedSummaryCache(projectPath, intent);
  // if (cached) return cached;

  const { loadGraphStore } = await import('../utils/graph-loader.js');
  const store = await loadGraphStore(projectPath);
  if (!store) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No graph found. Run `harness scan` or use `ingest_source` tool first.',
        },
      ],
      isError: true,
    };
  }

  const { FusionLayer, ContextQL } = await import('@harness-engineering/graph');
  const fusion = new FusionLayer(store);
  const cql = new ContextQL(store);

  // Search with intent (optionally scoped by content as filter)
  const searchQuery = filterContent ? `${intent} ${filterContent}` : intent;
  const searchResults = fusion.search(searchQuery, 10);

  if (searchResults.length === 0) {
    const envelope: PackedEnvelope = {
      meta: {
        strategy: pipeline.strategyNames,
        originalTokenEstimate: 0,
        compactedTokenEstimate: 0,
        reductionPct: 0,
        cached: false,
      },
      sections: [{ source: 'compact', content: 'No relevant context found for intent.' }],
    };
    return {
      content: [{ type: 'text' as const, text: serializeEnvelope(envelope) }],
    };
  }

  // Expand context around each result
  const perSectionBudget = Math.floor(budget / searchResults.length);
  const sections: Array<{ source: string; content: string }> = [];
  let totalOriginalChars = 0;

  for (const result of searchResults) {
    const expanded = cql.execute({
      rootNodeIds: [result.nodeId],
      maxDepth: 2,
    });

    const rawContent = JSON.stringify({
      rootNode: result.nodeId,
      score: result.score,
      nodes: expanded.nodes,
      edges: expanded.edges,
    });

    totalOriginalChars += rawContent.length;
    const compacted = pipeline.apply(rawContent, perSectionBudget);
    sections.push({ source: result.nodeId, content: compacted });
  }

  const originalTokens = estimateTokens('x'.repeat(totalOriginalChars));
  const compactedTokens = sections.reduce((sum, s) => sum + estimateTokens(s.content), 0);
  const reductionPct =
    originalTokens > 0 ? Math.round((1 - compactedTokens / originalTokens) * 100) : 0;

  const envelope: PackedEnvelope = {
    meta: {
      strategy: pipeline.strategyNames,
      originalTokenEstimate: originalTokens,
      compactedTokenEstimate: compactedTokens,
      reductionPct,
      cached: false,
    },
    sections,
  };

  // Phase 4 stub: write PackedSummary node to graph
  // TODO(Phase 4): await writePackedSummaryNode(projectPath, intent, envelope);

  return {
    content: [{ type: 'text' as const, text: serializeEnvelope(envelope) }],
  };
}

export async function handleCompact(input: {
  path: string;
  content?: string;
  intent?: string;
  ref?: { source: string; content: string };
  strategies?: StrategyName[];
  tokenBudget?: number;
}): Promise<ToolResult> {
  let safePath: string;
  try {
    safePath = sanitizePath(input.path);
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

  const budget = input.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const pipeline = buildPipeline(input.strategies);

  // Mode A: content
  if (input.content && !input.intent) {
    return handleContentMode(input.content, pipeline, budget, 'content');
  }

  // Mode C: ref
  if (input.ref) {
    return handleContentMode(input.ref.content, pipeline, budget, input.ref.source);
  }

  // Mode B: intent (with optional content filter)
  if (input.intent) {
    return handleIntentMode(safePath, input.intent, pipeline, budget, input.content);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: 'Error: must provide at least one of: content, intent, or ref',
      },
    ],
    isError: true,
  };
}
