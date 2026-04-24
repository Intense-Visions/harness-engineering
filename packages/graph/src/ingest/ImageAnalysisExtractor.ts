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
        // Call the analysis provider with a descriptive prompt
        const response = await this.provider.analyze<ImageAnalysisResult>({
          prompt: 'Analyze this image and provide a structured description of its visual contents.',
          systemPrompt:
            'You are an image analysis assistant. Describe the image contents, detect UI elements, extract visible text, identify design patterns, and note accessibility concerns.',
          responseSchema: {} as unknown, // Schema handled by provider
          maxTokens: 1000,
        });

        const result = response.result;
        const pathHash = hash(imagePath);
        const annotationId = `img:${pathHash}`;

        // Create image_annotation node
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
        nodesAdded++;

        // Create annotates edge to source file node if it exists
        const fileNodes = store.findNodes({ type: 'file' });
        const fileNode = fileNodes.find((n) => n.path === imagePath);
        if (fileNode) {
          store.addEdge({ from: annotationId, to: fileNode.id, type: 'annotates' });
          edgesAdded++;
        }

        // Create business_concept nodes for high-confidence design patterns
        for (const pattern of result.designPatterns) {
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
          nodesAdded++;

          // Link concept to its parent annotation
          store.addEdge({ from: annotationId, to: conceptId, type: 'contains' });
          edgesAdded++;
        }
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
}
