import type { GraphStore } from '../store/GraphStore.js';
import type { AskGraphResult } from './types.js';
import { IntentClassifier } from './IntentClassifier.js';
import { EntityExtractor } from './EntityExtractor.js';
import { EntityResolver } from './EntityResolver.js';
import { ResponseFormatter } from './ResponseFormatter.js';
import { FusionLayer } from '../search/FusionLayer.js';
import { ContextQL } from '../query/ContextQL.js';
import { groupNodesByImpact } from '../query/groupImpact.js';
import { GraphAnomalyAdapter } from '../entropy/GraphAnomalyAdapter.js';

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

export async function askGraph(store: GraphStore, question: string): Promise<AskGraphResult> {
  const fusion = new FusionLayer(store);
  const resolver = new EntityResolver(store, fusion);

  // Step 1: Classify intent
  const classification = classifier.classify(question);

  // Step 2: Low-confidence bail-out
  if (classification.confidence < 0.3) {
    return {
      intent: classification.intent,
      intentConfidence: classification.confidence,
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

  // Step 3: Extract entities
  const rawEntities = extractor.extract(question);

  // Step 4: Resolve entities
  const entities = resolver.resolve(rawEntities);

  // Step 5: Check if entity-requiring intents have entities
  if (ENTITY_REQUIRED_INTENTS.has(classification.intent) && entities.length === 0) {
    return {
      intent: classification.intent,
      intentConfidence: classification.confidence,
      entities: [],
      summary:
        'Could not find any matching nodes in the graph for your query. Try using exact class names, function names, or file paths.',
      data: null,
    };
  }

  // Step 6: Execute graph operation
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

  // Step 7: Format response
  const summary = formatter.format(classification.intent, entities, data, question);

  return {
    intent: classification.intent,
    intentConfidence: classification.confidence,
    entities,
    summary,
    data,
  };
}

/**
 * Execute the appropriate graph operation based on classified intent.
 */
function executeOperation(
  store: GraphStore,
  intent: string,
  entities: readonly import('./types.js').ResolvedEntity[],
  question: string,
  fusion: FusionLayer
): unknown {
  const cql = new ContextQL(store);

  switch (intent) {
    case 'impact': {
      const rootId = entities[0]!.nodeId;
      const result = cql.execute({
        rootNodeIds: [rootId],
        bidirectional: true,
        maxDepth: 3,
      });

      return groupNodesByImpact(result.nodes, rootId);
    }

    case 'find': {
      return fusion.search(question, 10);
    }

    case 'relationships': {
      const rootId = entities[0]!.nodeId;
      const result = cql.execute({
        rootNodeIds: [rootId],
        bidirectional: true,
        maxDepth: 1,
      });
      return { nodes: result.nodes, edges: result.edges };
    }

    case 'explain': {
      const searchResults = fusion.search(question, 10);

      const contextBlocks: Array<{
        rootNode: string;
        score: number;
        nodes: unknown[];
        edges: unknown[];
      }> = [];

      // Use resolved entity as primary root, fall back to search results
      const rootIds =
        entities.length > 0
          ? [entities[0]!.nodeId]
          : searchResults.slice(0, 3).map((r) => r.nodeId);

      for (const rootId of rootIds) {
        const expanded = cql.execute({
          rootNodeIds: [rootId],
          maxDepth: 2,
        });
        const matchingResult = searchResults.find((r) => r.nodeId === rootId);
        contextBlocks.push({
          rootNode: rootId,
          score: matchingResult?.score ?? 1.0,
          nodes: expanded.nodes as unknown[],
          edges: expanded.edges as unknown[],
        });
      }

      return { searchResults, context: contextBlocks };
    }

    case 'anomaly': {
      const adapter = new GraphAnomalyAdapter(store);
      return adapter.detect();
    }

    default:
      return null;
  }
}
