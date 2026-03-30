import { sanitizePath } from '../utils/sanitize-path.js';

type IncludeKey =
  | 'state'
  | 'learnings'
  | 'handoff'
  | 'graph'
  | 'validation'
  | 'sessions'
  | 'events';

export const gatherContextDefinition = {
  name: 'gather_context',
  description:
    'Assemble all working context an agent needs in a single call: state, learnings, handoff, graph context, project validation, and session sections. Runs constituents in parallel.',
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
          enum: ['state', 'learnings', 'handoff', 'graph', 'validation', 'sessions', 'events'],
        },
        description: 'Which constituents to include (default: all)',
      },
      includeEvents: {
        type: 'boolean',
        description:
          'Include recent events timeline. Default: true when session is provided, false otherwise. Can also be controlled via include array.',
      },
      mode: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description: 'Response density. Default: summary',
      },
      learningsBudget: {
        type: 'number',
        description:
          'Token budget for learnings slice (default 1000). Separate from graph tokenBudget.',
      },
      session: {
        type: 'string',
        description:
          'Session slug for session-scoped state. When provided, state/learnings/handoff/failures are read from .harness/sessions/<session>/ instead of .harness/. Omit for global fallback.',
      },
      depth: {
        type: 'string',
        enum: ['index', 'summary', 'full'],
        description:
          'Retrieval depth for learnings. "index" returns one-line summaries, "summary" (default) returns full entries, "full" returns entries with linked context.',
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
  includeEvents?: boolean;
  mode?: 'summary' | 'detailed';
  learningsBudget?: number;
  session?: string;
  depth?: 'index' | 'summary' | 'full';
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
    ? import('@harness-engineering/core').then((core) =>
        core.loadState(projectPath, undefined, input.session)
      )
    : Promise.resolve(null);

  const learningsPromise = includeSet.has('learnings')
    ? import('@harness-engineering/core').then((core) =>
        core.loadBudgetedLearnings(projectPath, {
          intent: input.intent,
          tokenBudget: input.learningsBudget ?? 1000,
          ...(input.skill !== undefined && { skill: input.skill }),
          ...(input.session !== undefined && { session: input.session }),
          ...(input.depth !== undefined && { depth: input.depth }),
        })
      )
    : Promise.resolve(null);

  const handoffPromise = includeSet.has('handoff')
    ? import('@harness-engineering/core').then((core) =>
        core.loadHandoff(projectPath, undefined, input.session)
      )
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

  const sessionsPromise =
    includeSet.has('sessions') && input.session
      ? import('@harness-engineering/core').then((core) =>
          core.readSessionSections(projectPath, input.session!)
        )
      : Promise.resolve(null);

  // Events: default true for session-scoped, false for global (unless explicitly set)
  const shouldIncludeEvents =
    input.includeEvents !== undefined
      ? input.includeEvents
      : includeSet.has('events') || (!!input.session && !input.include);

  const eventsPromise = shouldIncludeEvents
    ? import('@harness-engineering/core').then(async (core) => {
        const result = await core.loadEvents(projectPath, {
          session: input.session,
        });
        if (!result.ok) return null;
        return core.formatEventTimeline(result.value);
      })
    : Promise.resolve(null);

  const validationPromise = includeSet.has('validation')
    ? (async () => {
        const { handleValidateProject } = await import('./validate.js');
        const result = await handleValidateProject({ path: projectPath });
        const first = result.content[0];
        return first ? JSON.parse(first.text) : null;
      })()
    : Promise.resolve(null);

  // Execute all in parallel
  const [
    stateResult,
    learningsResult,
    handoffResult,
    graphResult,
    validationResult,
    sessionsResult,
    eventsResult,
  ] = await Promise.allSettled([
    statePromise,
    learningsPromise,
    handoffPromise,
    graphPromise,
    validationPromise,
    sessionsPromise,
    eventsPromise,
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
  const sessionsRaw = extract(sessionsResult, 'sessions');
  const eventsTimeline = extract(eventsResult, 'events');

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

  const sessionSections =
    sessionsRaw && typeof sessionsRaw === 'object' && 'ok' in sessionsRaw
      ? (sessionsRaw as { ok: boolean; value?: unknown }).ok
        ? (sessionsRaw as { value: unknown }).value
        : (() => {
            errors.push(
              `sessions: ${(sessionsRaw as { error: { message: string } }).error.message}`
            );
            return null;
          })()
      : sessionsRaw;

  const assembledIn = Date.now() - start;
  const mode = input.mode ?? 'summary'; // default summary for composites

  // Build output, applying summary stripping if mode is 'summary'
  const outputState = state ?? null;
  const outputLearnings = learnings ?? [];
  const outputHandoff = handoff ?? null;
  // Graph context shape returned by the graph promise above.
  // Summary mode aggregates node/edge counts across all context blocks.
  interface GraphContextBlock {
    rootNode: string;
    score: number;
    nodes: unknown[];
    edges: unknown[];
  }
  interface GraphContextResult {
    intent: string;
    tokenBudget: number;
    blocksReturned: number;
    context: GraphContextBlock[];
  }

  const outputGraphContext =
    graphContext == null
      ? null
      : mode === 'summary'
        ? {
            blocksReturned: (graphContext as GraphContextResult).blocksReturned ?? 0,
            nodeCount: ((graphContext as GraphContextResult).context ?? []).reduce(
              (sum: number, b: GraphContextBlock) =>
                sum + (Array.isArray(b.nodes) ? b.nodes.length : 0),
              0
            ),
            edgeCount: ((graphContext as GraphContextResult).context ?? []).reduce(
              (sum: number, b: GraphContextBlock) =>
                sum + (Array.isArray(b.edges) ? b.edges.length : 0),
              0
            ),
            intent: (graphContext as GraphContextResult).intent ?? null,
          }
        : graphContext;
  const outputValidation = validation ?? null;

  const output = {
    state: outputState,
    learnings: outputLearnings,
    handoff: outputHandoff,
    graphContext: outputGraphContext,
    validation: outputValidation,
    sessionSections: sessionSections ?? null,
    events: eventsTimeline || null,
    meta: {
      assembledIn,
      graphAvailable: graphContext !== null,
      tokenEstimate: 0, // set below from final serialization
      errors,
    },
  };

  // Update session index if session-scoped
  if (input.session) {
    try {
      const core = await import('@harness-engineering/core');
      core.updateSessionIndex(
        projectPath,
        input.session,
        `${input.skill ?? 'unknown'} — ${input.intent}`
      );
    } catch {
      // Index update is best-effort, do not fail the gather
    }
  }

  // Compute token estimate from final output (avoid double serialization)
  const outputText = JSON.stringify(output);
  const tokenEstimate = Math.ceil(outputText.length / 4);
  output.meta.tokenEstimate = tokenEstimate;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(output),
      },
    ],
  };
}
