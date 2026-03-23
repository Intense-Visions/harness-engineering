import { sanitizePath } from '../utils/sanitize-path.js';

type IncludeKey = 'state' | 'learnings' | 'handoff' | 'graph' | 'validation';

export const gatherContextDefinition = {
  name: 'gather_context',
  description:
    'Assemble all working context an agent needs in a single call: state, learnings, handoff, graph context, and project validation. Runs constituents in parallel.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      intent: {
        type: 'string',
        description: 'What the agent is about to do (used for graph context search)',
      },
      skill: {
        type: 'string',
        description: 'Current skill name (filters learnings by skill)',
      },
      tokenBudget: {
        type: 'number',
        description: 'Approximate token budget for graph context (default 4000)',
      },
      include: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['state', 'learnings', 'handoff', 'graph', 'validation'],
        },
        description: 'Which constituents to include (default: all)',
      },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description: 'Response density. Default: summary',
      },
    },
    required: ['path', 'intent'],
  },
};

export async function handleGatherContext(input: {
  path: string;
  intent: string;
  skill?: string;
  tokenBudget?: number;
  include?: IncludeKey[];
  mode?: 'summary' | 'detailed';
}) {
  const start = Date.now();

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

  const includeSet = new Set<IncludeKey>(
    input.include ?? ['state', 'learnings', 'handoff', 'graph', 'validation']
  );

  const errors: string[] = [];

  // Build constituent promises
  const statePromise = includeSet.has('state')
    ? import('@harness-engineering/core').then((core) => core.loadState(projectPath))
    : Promise.resolve(null);

  const learningsPromise = includeSet.has('learnings')
    ? import('@harness-engineering/core').then((core) =>
        core.loadRelevantLearnings(projectPath, input.skill)
      )
    : Promise.resolve(null);

  const handoffPromise = includeSet.has('handoff')
    ? import('@harness-engineering/core').then((core) => core.loadHandoff(projectPath))
    : Promise.resolve(null);

  const graphPromise = includeSet.has('graph')
    ? (async () => {
        const { loadGraphStore } = await import('../utils/graph-loader.js');
        const store = await loadGraphStore(projectPath);
        if (!store) return null;
        const { FusionLayer, ContextQL } = await import('@harness-engineering/graph');
        const fusion = new FusionLayer(store);
        const cql = new ContextQL(store);
        const tokenBudget = input.tokenBudget ?? 4000;
        const charBudget = tokenBudget * 4;
        const searchResults = fusion.search(input.intent, 10);
        if (searchResults.length === 0) return { context: [], tokenBudget };
        const contextBlocks: Array<{
          rootNode: string;
          score: number;
          nodes: unknown[];
          edges: unknown[];
        }> = [];
        let totalChars = 0;
        for (const result of searchResults) {
          if (totalChars >= charBudget) break;
          const expanded = cql.execute({
            rootNodeIds: [result.nodeId],
            maxDepth: 2,
          });
          const blockJson = JSON.stringify({
            rootNode: result.nodeId,
            score: result.score,
            nodes: expanded.nodes,
            edges: expanded.edges,
          });
          if (totalChars + blockJson.length > charBudget && contextBlocks.length > 0) break;
          contextBlocks.push({
            rootNode: result.nodeId,
            score: result.score,
            nodes: expanded.nodes as unknown[],
            edges: expanded.edges as unknown[],
          });
          totalChars += blockJson.length;
        }
        return {
          intent: input.intent,
          tokenBudget,
          blocksReturned: contextBlocks.length,
          context: contextBlocks,
        };
      })()
    : Promise.resolve(null);

  const validationPromise = includeSet.has('validation')
    ? (async () => {
        const { handleValidateProject } = await import('./validate.js');
        const result = await handleValidateProject({ path: projectPath });
        return JSON.parse(result.content[0].text);
      })()
    : Promise.resolve(null);

  // Execute all in parallel
  const [stateResult, learningsResult, handoffResult, graphResult, validationResult] =
    await Promise.allSettled([
      statePromise,
      learningsPromise,
      handoffPromise,
      graphPromise,
      validationPromise,
    ]);

  // Extract results, recording errors
  function extract<T>(settled: PromiseSettledResult<T | null>, name: string): T | null {
    if (settled.status === 'rejected') {
      errors.push(`${name}: ${String(settled.reason)}`);
      return null;
    }
    return settled.value;
  }

  const stateRaw = extract(stateResult, 'state');
  const learningsRaw = extract(learningsResult, 'learnings');
  const handoffRaw = extract(handoffResult, 'handoff');
  const graphContextRaw = extract(graphResult, 'graph');
  const validationRaw = extract(validationResult, 'validation');

  // Unwrap Result types from core functions
  const state =
    stateRaw && typeof stateRaw === 'object' && 'ok' in stateRaw
      ? (stateRaw as { ok: boolean; value?: unknown }).ok
        ? (stateRaw as { value: unknown }).value
        : (() => {
            errors.push(`state: ${(stateRaw as { error: { message: string } }).error.message}`);
            return null;
          })()
      : stateRaw;

  const learnings =
    learningsRaw && typeof learningsRaw === 'object' && 'ok' in learningsRaw
      ? (learningsRaw as { ok: boolean; value?: unknown }).ok
        ? (learningsRaw as { value: unknown }).value
        : (() => {
            errors.push(
              `learnings: ${(learningsRaw as { error: { message: string } }).error.message}`
            );
            return [];
          })()
      : (learningsRaw ?? []);

  const handoff =
    handoffRaw && typeof handoffRaw === 'object' && 'ok' in handoffRaw
      ? (handoffRaw as { ok: boolean; value?: unknown }).ok
        ? (handoffRaw as { value: unknown }).value
        : (() => {
            errors.push(`handoff: ${(handoffRaw as { error: { message: string } }).error.message}`);
            return null;
          })()
      : handoffRaw;

  const graphContext = graphContextRaw;
  const validation = validationRaw;

  const assembledIn = Date.now() - start;
  const responseJson = JSON.stringify({
    state: state ?? null,
    learnings: learnings ?? [],
    handoff: handoff ?? null,
    graphContext: graphContext ?? null,
    validation: validation ?? null,
    meta: {
      assembledIn,
      graphAvailable: graphContext !== null,
      tokenEstimate: 0, // will be set below
      errors,
    },
  });

  // Estimate tokens (~4 chars per token)
  const tokenEstimate = Math.ceil(responseJson.length / 4);

  const output = {
    state: state ?? null,
    learnings: learnings ?? [],
    handoff: handoff ?? null,
    graphContext: graphContext ?? null,
    validation: validation ?? null,
    meta: {
      assembledIn,
      graphAvailable: graphContext !== null,
      tokenEstimate,
      errors,
    },
  };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(output),
      },
    ],
  };
}
