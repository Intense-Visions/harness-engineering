import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult, GraphNode, GraphEdge, EdgeType } from '../../types.js';
import { hash } from '../ingestUtils.js';
import { DEFAULT_SKIP_DIRS } from '../skip-dirs.js';
import type { ExtractionRecord, Language, SignalExtractor } from './types.js';

/** Map file extensions to Language. */
const EXT_TO_LANGUAGE: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
};

/** Extensions we skip even if they match (e.g. .d.ts). */
const SKIP_EXTENSIONS = new Set(['.d.ts']);

/** Detect language from a file path. Returns undefined if unsupported. */
export function detectLanguage(filePath: string): Language | undefined {
  const name = path.basename(filePath);
  // Check skip extensions first
  for (const skip of SKIP_EXTENSIONS) {
    if (name.endsWith(skip)) return undefined;
  }
  const ext = path.extname(filePath);
  return EXT_TO_LANGUAGE[ext];
}

/** Edge type mapping by extractor per the spec. */
const EXTRACTOR_EDGE_TYPE: Record<string, EdgeType> = {
  'test-descriptions': 'governs',
  'enum-constants': 'documents',
  'validation-rules': 'governs',
  'api-paths': 'documents',
};

/**
 * Orchestrates code signal extraction across a project.
 * Walks files, dispatches to registered extractors, writes JSONL,
 * persists to graph, and handles stale detection.
 */
export class ExtractionRunner {
  constructor(private readonly extractors: readonly SignalExtractor[]) {}

  /**
   * Run all extractors against a project directory.
   * @param projectDir - Project root directory
   * @param store - GraphStore for node/edge persistence
   * @param outputDir - Directory for JSONL output (e.g. .harness/knowledge/extracted/)
   */
  async run(projectDir: string, store: GraphStore, outputDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let nodesUpdated = 0;
    let edgesAdded = 0;

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Walk project for source files
    const files = await this.findSourceFiles(projectDir);

    // Collect records per extractor
    const recordsByExtractor = new Map<string, ExtractionRecord[]>();
    for (const ext of this.extractors) {
      recordsByExtractor.set(ext.name, []);
    }

    // Process each file
    for (const filePath of files) {
      const language = detectLanguage(filePath);
      if (!language) continue;

      const ext = path.extname(filePath);
      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch (err) {
        errors.push(
          `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }

      const relativePath = path.relative(projectDir, filePath).replaceAll('\\', '/');

      for (const extractor of this.extractors) {
        if (!extractor.supportedExtensions.includes(ext)) continue;
        try {
          const records = extractor.extract(content, relativePath, language);
          recordsByExtractor.get(extractor.name)!.push(...records);
        } catch (err) {
          errors.push(
            `Extractor ${extractor.name} failed on ${relativePath}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    // Write JSONL files and persist to graph
    const allCurrentIds = new Set<string>();

    for (const [extractorName, records] of recordsByExtractor) {
      // Write JSONL
      await this.writeJsonl(records, outputDir, extractorName);

      // Persist to graph
      for (const record of records) {
        allCurrentIds.add(record.id);
        const result = this.persistRecord(record, store);
        nodesAdded += result.nodesAdded;
        nodesUpdated += result.nodesUpdated;
        edgesAdded += result.edgesAdded;
      }
    }

    // Mark stale nodes
    const staleCount = this.markStale(store, allCurrentIds);
    nodesUpdated += staleCount;

    return {
      nodesAdded,
      nodesUpdated,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  /** Write extraction records to JSONL file. */
  async writeJsonl(
    records: readonly ExtractionRecord[],
    outputDir: string,
    extractorName: string
  ): Promise<void> {
    const filePath = path.join(outputDir, `${extractorName}.jsonl`);
    const lines = records.map((r) => JSON.stringify(r));
    await fs.writeFile(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
  }

  /** Create or update a graph node from an extraction record. */
  private persistRecord(
    record: ExtractionRecord,
    store: GraphStore
  ): { nodesAdded: number; nodesUpdated: number; edgesAdded: number } {
    const existing = store.getNode(record.id);

    const node: GraphNode = {
      id: record.id,
      type: record.nodeType,
      name: record.name,
      path: record.filePath,
      location: {
        fileId: `file:${hash(record.filePath)}`,
        startLine: record.line,
        endLine: record.line,
      },
      content: record.content,
      metadata: {
        ...record.metadata,
        source: 'code-extractor',
        extractor: record.extractor,
        confidence: record.confidence,
        language: record.language,
        stale: false,
      },
    };

    store.addNode(node);

    // Create edge to source file node
    const fileNodeId = `file:${hash(record.filePath)}`;
    const edgeType = EXTRACTOR_EDGE_TYPE[record.extractor] ?? 'documents';
    const edge: GraphEdge = {
      from: record.id,
      to: fileNodeId,
      type: edgeType,
      confidence: record.confidence,
      metadata: { source: 'code-extractor' },
    };
    store.addEdge(edge);

    return {
      nodesAdded: existing ? 0 : 1,
      nodesUpdated: existing ? 1 : 0,
      edgesAdded: existing ? 0 : 1,
    };
  }

  /**
   * Mark nodes from previous extractions that are no longer present as stale.
   * Returns the number of nodes marked stale.
   */
  markStale(store: GraphStore, currentIds: Set<string>): number {
    let count = 0;
    const businessTypes = ['business_rule', 'business_process', 'business_term'] as const;

    for (const type of businessTypes) {
      const nodes = store.findNodes({ type });
      for (const node of nodes) {
        if (
          node.metadata.source === 'code-extractor' &&
          !node.metadata.stale &&
          !currentIds.has(node.id)
        ) {
          // Mark as stale by re-adding with stale metadata
          store.addNode({
            ...node,
            metadata: {
              ...node.metadata,
              stale: true,
              staleAt: new Date().toISOString(),
            },
          });
          count++;
        }
      }
    }
    return count;
  }

  /** Recursively find source files, skipping common non-source directories. */
  async findSourceFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !DEFAULT_SKIP_DIRS.has(entry.name)) {
        results.push(...(await this.findSourceFiles(fullPath)));
      } else if (entry.isFile() && detectLanguage(fullPath) !== undefined) {
        results.push(fullPath);
      }
    }
    return results;
  }
}
