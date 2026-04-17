/**
 * Supported languages for AST code navigation.
 */
export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java';

/**
 * Kind of code symbol extracted from AST.
 */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'method'
  | 'property'
  | 'export'
  | 'import';

/**
 * A code symbol with its location and metadata.
 */
export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  endLine: number;
  signature: string;
  children?: CodeSymbol[];
}

/**
 * Result of code_outline — structural skeleton of a file.
 */
export interface OutlineResult {
  file: string;
  language: SupportedLanguage | 'unknown';
  totalLines: number;
  symbols: CodeSymbol[];
  error?: string; // '[parse-failed]' when parsing fails
}

/**
 * A single match from code_search.
 */
export interface SearchMatch {
  symbol: CodeSymbol;
  context: string; // one-line context around the match
}

/**
 * Result of code_search — cross-file symbol discovery.
 */
export interface SearchResult {
  query: string;
  matches: SearchMatch[];
  skipped: string[]; // files that could not be parsed
}

/**
 * Result of code_unfold — AST-bounded code extraction.
 */
export interface UnfoldResult {
  file: string;
  symbolName?: string;
  startLine: number;
  endLine: number;
  content: string;
  language: SupportedLanguage | 'unknown';
  fallback: boolean; // true when raw content was returned
  warning?: string; // '[fallback: raw content]' when in fallback mode
}

/**
 * Map file extensions to supported languages.
 */
export const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
};

/**
 * Detect language from file extension.
 */
export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return EXTENSION_MAP[ext] ?? null;
}
