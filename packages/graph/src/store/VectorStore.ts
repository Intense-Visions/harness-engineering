/**
 * Result returned from a vector similarity search.
 */
export interface VectorSearchResult {
  id: string;
  score: number;
}

/**
 * Compute the cosine similarity between two equal-length numeric vectors.
 * Returns 0 when either vector has zero magnitude.
 */
function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * A brute-force in-memory vector store that supports add, remove, and
 * top-K cosine-similarity search.
 */
export class VectorStore {
  private readonly dimensions: number;
  private readonly vectors: Map<string, readonly number[]> = new Map();

  constructor(dimensions: number) {
    this.dimensions = dimensions;
  }

  /** Number of vectors currently stored. */
  get size(): number {
    return this.vectors.size;
  }

  /** Add a vector with the given id. Throws if dimensions do not match. */
  add(id: string, vector: readonly number[]): void {
    if (vector.length !== this.dimensions) {
      throw new Error(`Dimension mismatch: expected ${this.dimensions}, got ${vector.length}`);
    }
    this.vectors.set(id, vector);
  }

  /** Remove a vector by id. Returns true if the vector existed. */
  remove(id: string): boolean {
    return this.vectors.delete(id);
  }

  /** Check whether a vector with the given id exists. */
  has(id: string): boolean {
    return this.vectors.has(id);
  }

  /** Remove all stored vectors. */
  clear(): void {
    this.vectors.clear();
  }

  /**
   * Return the top-K most similar vectors to the query, sorted by descending
   * cosine similarity score.  If the store contains fewer than topK vectors,
   * all available results are returned.
   */
  search(query: readonly number[], topK: number): VectorSearchResult[] {
    if (query.length !== this.dimensions) {
      throw new Error(`Dimension mismatch: expected ${this.dimensions}, got ${query.length}`);
    }

    const results: VectorSearchResult[] = [];
    for (const [id, vector] of this.vectors) {
      results.push({ id, score: cosineSimilarity(query, vector) });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /** Serialize the store to a plain object for persistence. */
  serialize(): { dimensions: number; vectors: Array<{ id: string; vector: number[] }> } {
    const vectors: Array<{ id: string; vector: number[] }> = [];
    for (const [id, vector] of this.vectors) {
      vectors.push({ id, vector: [...vector] });
    }
    return { dimensions: this.dimensions, vectors };
  }

  /** Deserialize a previously-serialized store. */
  static deserialize(data: {
    dimensions: number;
    vectors: Array<{ id: string; vector: number[] }>;
  }): VectorStore {
    const store = new VectorStore(data.dimensions);
    for (const { id, vector } of data.vectors) {
      store.add(id, vector);
    }
    return store;
  }
}
