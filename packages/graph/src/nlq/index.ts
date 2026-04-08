import type { GraphStore } from '../store/GraphStore.js';
import type { AskGraphResult, Intent, ResolvedEntity } from './types.js';
import { IntentClassifier } from './IntentClassifier.js';
import { EntityExtractor } from './EntityExtractor.js';
import { EntityResolver } from './EntityResolver.js';
import { ResponseFormatter } from './ResponseFormatter.js';
import { FusionLayer } from '../search/FusionLayer.js';
import { ContextQL } from '../query/ContextQL.js';
import { groupNodesByImpact } from '../query/groupImpact.js';
import { GraphAnomalyAdapter } from '../entropy/GraphAnomalyAdapter.js';
import { CascadeSimulator } from '../blast-radius/index.js';

export { INTENTS } from './types.js';
export type { Intent, ClassificationResult, ResolvedEntity, AskGraphResult } from './types.js';
export { IntentClassifier } from './IntentClassifier.js';
export { EntityExtractor } from './EntityExtractor.js';
export { EntityResolver } from './EntityResolver.js';
export { ResponseFormatter } from './ResponseFormatter.js';

/** Intents that require at least one resolved entity to produce meaningful results. */
const ENTITY_REQUIRED_INTENTS = new Set(['impact', 'relationships', 'explain']);

/**
 * Ask a natural language question about the codebase knowledge graph.
 *
 * Translates the question into graph operations and returns a human-readable
 * summary alongside raw graph data.
 *
 * @param store - The GraphStore instance to query against
 * @param question - Natural language question about the codebase
 * @returns AskGraphResult with intent, entities, summary, and raw data
 */
/** Module-level singletons for stateless components */
const classifier = new IntentClassifier();
const extractor = new EntityExtractor();
const formatter = new ResponseFormatter();

function lowConfidenceResult(intent: Intent, confidence: number): AskGraphResult {
  return {
    intent,
    intentConfidence: confidence,
    entities: [],
    summary: "I'm not sure what you're asking. Try rephrasing your question.",
    data: null,
    suggestions: [
      'Try "what breaks if I change <name>?" for impact analysis',
      'Try "where is <name>?" to find entities',
      'Try "what calls <name>?" for relationships',
      'Try "what is <name>?" for explanations',
      'Try "what looks wrong?" for anomaly detection',
    ],
  };
}

function noEntityResult(intent: Intent, confidence: number): AskGraphResult {
  return {
    intent,
    intentConfidence: confidence,
    entities: [],
    summary:
      'Could not find any matching nodes in the graph for your query. Try using exact class names, function names, or file paths.',
    data: null,
  };
}

export async function askGraph(store: GraphStore, question: string): Promise<AskGraphResult> {
  const fusion = new FusionLayer(store);
  const resolver = new EntityResolver(store, fusion);
  const classification = classifier.classify(question);

  if (classification.confidence < 0.3) {
    return lowConfidenceResult(classification.intent, classification.confidence);
  }

  const entities = resolver.resolve(extractor.extract(question));

  if (ENTITY_REQUIRED_INTENTS.has(classification.intent) && entities.length === 0) {
    return noEntityResult(classification.intent, classification.confidence);
  }

  let data: unknown;
  try {
    data = executeOperation(store, classification.intent, entities, question, fusion);
  } catch (err) {
    return {
      intent: classification.intent,
      intentConfidence: classification.confidence,
      entities,
      summary: `An error occurred while querying the graph: ${err instanceof Error ? err.message : String(err)}`,
      data: null,
    };
  }

  return {
    intent: classification.intent,
    intentConfidence: classification.confidence,
    entities,
    summary: formatter.format(classification.intent, entities, data, question),
    data,
  };
}

type ContextBlock = { rootNode: string; score: number; nodes: unknown[]; edges: unknown[] };

function buildContextBlocks(
  cql: ContextQL,
  rootIds: string[],
  searchResults: ReturnType<FusionLayer['search']>
): ContextBlock[] {
  return rootIds.map((rootId) => {
    const expanded = cql.execute({ rootNodeIds: [rootId], maxDepth: 2 });
    const match = searchResults.find((r) => r.nodeId === rootId);
    return {
      rootNode: rootId,
      score: match?.score ?? 1.0,
      nodes: expanded.nodes as unknown[],
      edges: expanded.edges as unknown[],
    };
  });
}

function executeImpact(
  store: GraphStore,
  cql: ContextQL,
  entities: readonly ResolvedEntity[],
  question: string
): unknown {
  const rootId = entities[0]!.nodeId;
  const lower = question.toLowerCase();
  if (lower.includes('blast radius') || lower.includes('cascade')) {
    return new CascadeSimulator(store).simulate(rootId);
  }
  const result = cql.execute({ rootNodeIds: [rootId], bidirectional: true, maxDepth: 3 });
  return groupNodesByImpact(result.nodes, rootId);
}

function executeExplain(
  cql: ContextQL,
  entities: readonly ResolvedEntity[],
  question: string,
  fusion: FusionLayer
): unknown {
  const searchResults = fusion.search(question, 10);
  const rootIds =
    entities.length > 0 ? [entities[0]!.nodeId] : searchResults.slice(0, 3).map((r) => r.nodeId);
  return { searchResults, context: buildContextBlocks(cql, rootIds, searchResults) };
}

function executeOperation(
  store: GraphStore,
  intent: Intent,
  entities: readonly ResolvedEntity[],
  question: string,
  fusion: FusionLayer
): unknown {
  const cql = new ContextQL(store);

  switch (intent) {
    case 'impact':
      return executeImpact(store, cql, entities, question);

    case 'find':
      return fusion.search(question, 10);

    case 'relationships': {
      const result = cql.execute({
        rootNodeIds: [entities[0]!.nodeId],
        bidirectional: true,
        maxDepth: 1,
      });
      return { nodes: result.nodes, edges: result.edges };
    }

    case 'explain':
      return executeExplain(cql, entities, question, fusion);

    case 'anomaly':
      return new GraphAnomalyAdapter(store).detect();

    default:
      return null;
  }
}
