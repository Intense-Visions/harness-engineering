import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult } from '../types.js';
import { hash } from './ingestUtils.js';

// Re-declare minimal AnalysisProvider interface to avoid cross-layer dependency
// on @harness-engineering/intelligence.

export interface AnalysisRequest {
  prompt: string;
  systemPrompt?: string;
  responseSchema: unknown; // Zod schema passed through
  model?: string;
  maxTokens?: number;
}

export interface AnalysisResponse<T> {
  result: T;
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  model: string;
  latencyMs: number;
}

export interface AnalysisProvider {
  analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>>;
}

export interface DetectedElement {
  readonly type: string;
  readonly label: string;
  readonly confidence: number;
}

export interface ImageAnalysisResult {
  readonly description: string;
  readonly detectedElements: readonly DetectedElement[];
  readonly extractedText: readonly string[];
  readonly designPatterns: readonly string[];
  readonly accessibilityNotes: readonly string[];
}

export interface ImageAnalysisExtractorOptions {
  readonly analysisProvider: AnalysisProvider;
  readonly maxFileSizeMB?: number;
}

export class ImageAnalysisExtractor {
  private readonly provider: AnalysisProvider;

  /** Maximum file size in bytes. Reserved for future file-size filtering. */
  readonly maxFileSizeBytes: number;

  constructor(options: ImageAnalysisExtractorOptions) {
    this.provider = options.analysisProvider;
    this.maxFileSizeBytes = (options.maxFileSizeMB ?? 10) * 1024 * 1024;
  }

  async analyze(store: GraphStore, imagePaths: readonly string[]): Promise<IngestResult> {
    const start = Date.now();
    let nodesAdded = 0;
    let edgesAdded = 0;
    const errors: string[] = [];

    for (const imagePath of imagePaths) {
      try {
        const counts = await this.processImage(store, imagePath);
        nodesAdded += counts.nodes;
        edgesAdded += counts.edges;
      } catch (err) {
        errors.push(
          `Image analysis failed for ${imagePath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  /** Analyze a single image and add annotation + concept nodes to the store. */
  private async processImage(
    store: GraphStore,
    imagePath: string
  ): Promise<{ nodes: number; edges: number }> {
    const response = await this.provider.analyze<ImageAnalysisResult>({
      prompt: 'Analyze this image and provide a structured description of its visual contents.',
      systemPrompt:
        'You are an image analysis assistant. Describe the image contents, detect UI elements, extract visible text, identify design patterns, and note accessibility concerns.',
      responseSchema: {} as unknown, // Schema handled by provider
      maxTokens: 1000,
    });

    const result = response.result;
    const annotationId = `img:${hash(imagePath)}`;
    let nodes = 0;
    let edges = 0;

    store.addNode({
      id: annotationId,
      type: 'image_annotation',
      name: result.description.slice(0, 200),
      path: imagePath,
      content: result.description,
      hash: hash(result.description),
      metadata: {
        source: 'image-analysis',
        detectedElements: result.detectedElements,
        extractedText: result.extractedText,
        designPatterns: result.designPatterns,
        accessibilityNotes: result.accessibilityNotes,
        model: response.model,
      },
    });
    nodes++;

    edges += this.linkToFileNode(store, annotationId, imagePath);

    for (const pattern of result.designPatterns) {
      edges += this.addDesignPatternConcept(store, annotationId, imagePath, pattern);
      nodes++;
    }

    return { nodes, edges };
  }

  /** Link annotation to its source file node if it exists. Returns 1 if linked, 0 otherwise. */
  private linkToFileNode(store: GraphStore, annotationId: string, imagePath: string): number {
    const fileNode = store.findNodes({ type: 'file' }).find((n) => n.path === imagePath);
    if (!fileNode) return 0;
    store.addEdge({ from: annotationId, to: fileNode.id, type: 'annotates' });
    return 1;
  }

  /** Create a business_concept node for a design pattern and link it. Returns edges added. */
  private addDesignPatternConcept(
    store: GraphStore,
    annotationId: string,
    imagePath: string,
    pattern: string
  ): number {
    const conceptId = `img:concept:${hash(pattern + imagePath)}`;
    store.addNode({
      id: conceptId,
      type: 'business_concept',
      name: pattern,
      content: `Design pattern detected in ${imagePath}: ${pattern}`,
      hash: hash(pattern),
      metadata: {
        source: 'image-analysis',
        sourceImage: imagePath,
        domain: 'design',
      },
    });
    store.addEdge({ from: annotationId, to: conceptId, type: 'contains' });
    return 1;
  }
}
