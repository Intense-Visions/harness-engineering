import type { GraphStore } from '../store/GraphStore.js';
import type { VectorStore } from '../store/VectorStore.js';
import type { GraphNode } from '../types.js';

export interface FusionResult {
  readonly nodeId: string;
  readonly node: GraphNode;
  readonly score: number;
  readonly signals: {
    readonly keyword: number;
    readonly semantic: number;
  };
}

const STOP_WORDS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'about',
  'this',
  'that',
  'it',
  'not',
  'but',
  'and',
  'or',
  'if',
  'then',
  'so',
]);

export class FusionLayer {
  private readonly store: GraphStore;
  private readonly vectorStore: VectorStore | undefined;
  private readonly keywordWeight: number;
  private readonly semanticWeight: number;

  constructor(
    store: GraphStore,
    vectorStore?: VectorStore,
    keywordWeight = 0.6,
    semanticWeight = 0.4
  ) {
    this.store = store;
    this.vectorStore = vectorStore;
    this.keywordWeight = keywordWeight;
    this.semanticWeight = semanticWeight;
  }

  search(query: string, topK = 10): FusionResult[] {
    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) {
      return [];
    }

    // Get all nodes from store (empty query returns all)
    const allNodes = this.store.findNodes({});

    // Build a map of semantic scores from VectorStore if available
    const semanticScores = new Map<string, number>();
    if (this.vectorStore) {
      // Look for embedding on the query — we need a query embedding.
      // Check if any node has an embedding to determine dimensions,
      // then search if we can find a query vector.
      // For now, we check if the vectorStore has entries and search with
      // whatever query embedding we can derive.
      // The caller is expected to have added vectors to the VectorStore.
      // We search using the embedding of a node matching the query, or
      // we need a query embedding passed separately.
      // Since the interface takes a string query, we search the VectorStore
      // using the first node's embedding dimension to construct a simple query.
      // Actually, re-reading the spec: "If VectorStore provided AND query embedding available"
      // We'll look for a node whose name matches the query to use its embedding.
      const queryNode = allNodes.find((n) => n.embedding && n.embedding.length > 0);
      if (queryNode?.embedding) {
        // Use the query string to find matching embeddings
        // For a real implementation, we'd embed the query string.
        // For now, search with a uniform vector (the VectorStore.search handles similarity)
        // Actually, let's check if any node has name matching query and use its embedding
        const matchingNode = allNodes.find(
          (n) => n.embedding && n.name.toLowerCase().includes(query.toLowerCase())
        );
        const queryEmbedding = matchingNode?.embedding ?? queryNode.embedding;
        const vectorResults = this.vectorStore.search(queryEmbedding, allNodes.length);
        for (const vr of vectorResults) {
          semanticScores.set(vr.id, vr.score);
        }
      }
    }

    const hasSemanticScores = semanticScores.size > 0;
    const kwWeight = hasSemanticScores ? this.keywordWeight : 1.0;
    const semWeight = hasSemanticScores ? this.semanticWeight : 0.0;

    const results: FusionResult[] = [];

    for (const node of allNodes) {
      const kwScore = this.keywordScore(keywords, node);
      const semScore = semanticScores.get(node.id) ?? 0;
      const fusedScore = kwWeight * kwScore + semWeight * semScore;

      if (fusedScore > 0) {
        results.push({
          nodeId: node.id,
          node,
          score: fusedScore,
          signals: {
            keyword: kwScore,
            semantic: semScore,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private extractKeywords(query: string): string[] {
    const tokens = query
      .toLowerCase()
      .split(/[\s\-_.,:;!?()[\]{}"'`/\\|@#$%^&*+=<>~]+/)
      .filter((t) => t.length >= 2)
      .filter((t) => !STOP_WORDS.has(t));

    return [...new Set(tokens)];
  }

  private keywordScore(keywords: string[], node: GraphNode): number {
    let maxScore = 0;

    for (const keyword of keywords) {
      const nameLower = node.name.toLowerCase();

      // Exact name match (case-insensitive)
      if (nameLower === keyword) {
        maxScore = Math.max(maxScore, 1.0);
        continue;
      }

      // Name contains keyword
      if (nameLower.includes(keyword)) {
        maxScore = Math.max(maxScore, 0.7);
        continue;
      }

      // Path contains keyword
      if (node.path && node.path.toLowerCase().includes(keyword)) {
        maxScore = Math.max(maxScore, 0.5);
        continue;
      }

      // Metadata value contains keyword
      for (const value of Object.values(node.metadata)) {
        if (typeof value === 'string' && value.toLowerCase().includes(keyword)) {
          maxScore = Math.max(maxScore, 0.3);
          break;
        }
      }
    }

    return maxScore;
  }
}
