import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import {
  ImageAnalysisExtractor,
  type AnalysisProvider,
  type AnalysisRequest,
  type AnalysisResponse,
  type ImageAnalysisResult,
} from '../../src/ingest/ImageAnalysisExtractor.js';

function createMockProvider(result: ImageAnalysisResult): AnalysisProvider {
  return {
    async analyze<T>(_request: AnalysisRequest): Promise<AnalysisResponse<T>> {
      return {
        result: result as unknown as T,
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        model: 'claude-sonnet-4-20250514',
        latencyMs: 500,
      };
    },
  };
}

function createFailingProvider(errorMessage: string): AnalysisProvider {
  return {
    async analyze<T>(_request: AnalysisRequest): Promise<AnalysisResponse<T>> {
      throw new Error(errorMessage);
    },
  };
}

const SAMPLE_RESULT: ImageAnalysisResult = {
  description: 'Login form with email and password fields',
  detectedElements: [{ type: 'form', label: 'Login Form', confidence: 0.95 }],
  extractedText: ['Sign In', 'Email', 'Password'],
  designPatterns: ['form-layout'],
  accessibilityNotes: ['Missing ARIA labels'],
};

describe('ImageAnalysisExtractor', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
  });

  it('creates image_annotation node from analysis result', async () => {
    const extractor = new ImageAnalysisExtractor({
      analysisProvider: createMockProvider(SAMPLE_RESULT),
    });

    const result = await extractor.analyze(store, ['src/assets/login.png']);

    expect(result.errors).toHaveLength(0);

    const annotations = store.findNodes({ type: 'image_annotation' });
    expect(annotations).toHaveLength(1);

    const annotation = annotations[0]!;
    expect(annotation.type).toBe('image_annotation');
    expect(annotation.name).toBe('Login form with email and password fields');
    expect(annotation.path).toBe('src/assets/login.png');
    expect(annotation.content).toBe('Login form with email and password fields');
    expect(annotation.metadata.source).toBe('image-analysis');
    expect(annotation.metadata.detectedElements).toEqual([
      { type: 'form', label: 'Login Form', confidence: 0.95 },
    ]);
    expect(annotation.metadata.extractedText).toEqual(['Sign In', 'Email', 'Password']);
    expect(annotation.metadata.designPatterns).toEqual(['form-layout']);
    expect(annotation.metadata.accessibilityNotes).toEqual(['Missing ARIA labels']);
    expect(annotation.metadata.model).toBe('claude-sonnet-4-20250514');
  });

  it('returns empty result when no images provided', async () => {
    const extractor = new ImageAnalysisExtractor({
      analysisProvider: createMockProvider(SAMPLE_RESULT),
    });

    const result = await extractor.analyze(store, []);

    expect(result.nodesAdded).toBe(0);
    expect(result.nodesUpdated).toBe(0);
    expect(result.edgesAdded).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('creates business_concept nodes for design patterns', async () => {
    const multiPatternResult: ImageAnalysisResult = {
      description: 'Dashboard with data tables and charts',
      detectedElements: [
        { type: 'table', label: 'Data Table', confidence: 0.9 },
        { type: 'chart', label: 'Bar Chart', confidence: 0.85 },
      ],
      extractedText: ['Revenue', 'Q1', 'Q2'],
      designPatterns: ['data-table', 'chart-visualization'],
      accessibilityNotes: [],
    };

    const extractor = new ImageAnalysisExtractor({
      analysisProvider: createMockProvider(multiPatternResult),
    });

    const result = await extractor.analyze(store, ['src/assets/dashboard.png']);

    expect(result.errors).toHaveLength(0);

    const concepts = store.findNodes({ type: 'business_concept' });
    expect(concepts).toHaveLength(2);

    const names = concepts.map((n) => n.name);
    expect(names).toContain('data-table');
    expect(names).toContain('chart-visualization');

    // Each concept should have correct metadata
    for (const concept of concepts) {
      expect(concept.metadata.source).toBe('image-analysis');
      expect(concept.metadata.sourceImage).toBe('src/assets/dashboard.png');
      expect(concept.metadata.domain).toBe('design');
    }
  });

  it('creates annotates edges from annotation to source file', async () => {
    // Pre-populate store with a file node for the image path
    store.addNode({
      id: 'file:login-png',
      type: 'file',
      name: 'login.png',
      path: 'src/assets/login.png',
      metadata: {},
    });

    const extractor = new ImageAnalysisExtractor({
      analysisProvider: createMockProvider(SAMPLE_RESULT),
    });

    const result = await extractor.analyze(store, ['src/assets/login.png']);

    expect(result.errors).toHaveLength(0);
    expect(result.edgesAdded).toBe(2); // 1 annotates (annotation -> file) + 1 contains (annotation -> concept)

    const edges = store.getEdges({ type: 'annotates' });
    expect(edges).toHaveLength(1);

    const edge = edges[0]!;
    expect(edge.to).toBe('file:login-png');
    expect(edge.type).toBe('annotates');
  });

  it('reports correct ingest counts', async () => {
    const extractor = new ImageAnalysisExtractor({
      analysisProvider: createMockProvider(SAMPLE_RESULT),
    });

    // SAMPLE_RESULT has 1 design pattern => 1 annotation + 1 concept = 2 nodes
    const result = await extractor.analyze(store, ['src/assets/login.png']);

    expect(result.nodesAdded).toBe(2); // 1 image_annotation + 1 business_concept
    expect(result.nodesUpdated).toBe(0);
    expect(result.edgesAdded).toBe(1); // 1 contains edge (annotation -> concept)
    expect(result.edgesUpdated).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles analysis provider errors gracefully', async () => {
    const extractor = new ImageAnalysisExtractor({
      analysisProvider: createFailingProvider('API rate limit exceeded'),
    });

    const result = await extractor.analyze(store, ['src/assets/broken.png']);

    expect(result.nodesAdded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Image analysis failed for src/assets/broken.png');
    expect(result.errors[0]).toContain('API rate limit exceeded');
  });

  it('processes multiple images independently', async () => {
    const extractor = new ImageAnalysisExtractor({
      analysisProvider: createMockProvider(SAMPLE_RESULT),
    });

    const result = await extractor.analyze(store, [
      'src/assets/login.png',
      'src/assets/signup.png',
      'src/assets/dashboard.png',
    ]);

    expect(result.errors).toHaveLength(0);

    const annotations = store.findNodes({ type: 'image_annotation' });
    expect(annotations).toHaveLength(3);

    // Each image produces 1 annotation + 1 concept (from 'form-layout' pattern)
    expect(result.nodesAdded).toBe(6); // 3 annotations + 3 concepts
  });
});
