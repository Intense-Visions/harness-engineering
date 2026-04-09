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

  search(query: string, topK = 10, queryEmbedding?: readonly number[]): FusionResult[] {
    const keywords = this.extractKeywords(query);
    if (keywords.length === 0) {
      return [];
    }

    const allNodes = this.store.findNodes({});
    const semanticScores = this.buildSemanticScores(queryEmbedding, allNodes.length);
    const { kwWeight, semWeight } = this.resolveWeights(semanticScores.size > 0);
    const results = this.scoreNodes(allNodes, keywords, semanticScores, kwWeight, semWeight);

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private buildSemanticScores(
    queryEmbedding: readonly number[] | undefined,
    nodeCount: number
  ): Map<string, number> {
    const semanticScores = new Map<string, number>();
    if (queryEmbedding && this.vectorStore) {
      const vectorResults = this.vectorStore.search(queryEmbedding, nodeCount);
      for (const vr of vectorResults) {
        semanticScores.set(vr.id, vr.score);
      }
    }
    return semanticScores;
  }

  private resolveWeights(hasSemanticScores: boolean): { kwWeight: number; semWeight: number } {
    return {
      kwWeight: hasSemanticScores ? this.keywordWeight : 1.0,
      semWeight: hasSemanticScores ? this.semanticWeight : 0.0,
    };
  }

  private scoreNodes(
    allNodes: GraphNode[],
    keywords: string[],
    semanticScores: Map<string, number>,
    kwWeight: number,
    semWeight: number
  ): FusionResult[] {
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
          signals: { keyword: kwScore, semantic: semScore },
        });
      }
    }
    return results;
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
    if (keywords.length === 0) return 0;
    let totalScore = 0;
    for (const keyword of keywords) {
      totalScore += this.singleKeywordScore(keyword, node);
    }
    return totalScore / keywords.length;
  }

  private singleKeywordScore(keyword: string, node: GraphNode): number {
    const nameLower = node.name.toLowerCase();

    // Exact name match (case-insensitive)
    if (nameLower === keyword) {
      return 1.0;
    }

    // Name contains keyword
    if (nameLower.includes(keyword)) {
      return 0.7;
    }

    // Path contains keyword
    if (node.path && node.path.toLowerCase().includes(keyword)) {
      return 0.5;
    }

    // Metadata value contains keyword
    for (const value of Object.values(node.metadata)) {
      if (typeof value === 'string' && value.toLowerCase().includes(keyword)) {
        return 0.3;
      }
    }

    return 0;
  }
}
