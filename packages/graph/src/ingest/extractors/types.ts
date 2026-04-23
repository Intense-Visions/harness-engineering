import type { NodeType } from '../../types.js';

/** Languages supported by the code signal extractors. */
export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java';

/**
 * A single business-signal extraction record.
 * Written to JSONL and used to create provisional graph nodes.
 */
export interface ExtractionRecord {
  /** Deterministic ID: `extracted:<extractor>:<hash(filePath+':'+patternKey)>` */
  readonly id: string;
  /** Which extractor produced this record. */
  readonly extractor: string;
  /** Source language of the file. */
  readonly language: Language;
  /** File path relative to project root. */
  readonly filePath: string;
  /** Start line of the extracted pattern (1-based). */
  readonly line: number;
  /** Graph node type this maps to. */
  readonly nodeType: NodeType;
  /** Human-readable label for the extracted fact. */
  readonly name: string;
  /** Raw extracted text. */
  readonly content: string;
  /** Extraction confidence (0.0-1.0). */
  readonly confidence: number;
  /** Extractor-specific metadata. */
  readonly metadata: Record<string, unknown>;
}

/**
 * Interface for pluggable code signal extractors.
 * Each extractor scans file content and returns extraction records.
 */
export interface SignalExtractor {
  /** Unique extractor identifier (e.g. 'test-descriptions'). */
  readonly name: string;
  /** File extensions this extractor can process. */
  readonly supportedExtensions: readonly string[];
  /** Extract signals from a single file's content. */
  extract(content: string, filePath: string, language: Language): ExtractionRecord[];
}
