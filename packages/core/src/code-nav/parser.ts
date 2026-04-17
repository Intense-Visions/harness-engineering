import Parser from 'web-tree-sitter';
import { readFileContent } from '../shared/fs-utils';
import { Ok, Err } from '../shared/result';
import type { Result } from '../shared/result';
import { detectLanguage, type SupportedLanguage } from './types';

export interface ParsedFile {
  tree: Parser.Tree;
  language: SupportedLanguage;
  source: string;
  filePath: string;
}

interface ParseFileError {
  code: 'UNSUPPORTED_LANGUAGE' | 'FILE_NOT_FOUND' | 'PARSE_FAILED' | 'INIT_FAILED';
  message: string;
}

// Cached parser instances per language
const parserCache = new Map<SupportedLanguage, Parser>();
let initialized = false;

/**
 * Map language to its tree-sitter WASM grammar module name.
 */
const GRAMMAR_MAP: Record<SupportedLanguage, string> = {
  typescript: 'tree-sitter-typescript',
  javascript: 'tree-sitter-javascript',
  python: 'tree-sitter-python',
  go: 'tree-sitter-go',
  rust: 'tree-sitter-rust',
  java: 'tree-sitter-java',
};

async function ensureInit(): Promise<void> {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
}

async function resolveWasmPath(grammarName: string): Promise<string> {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url ?? __filename);
  const pkgPath = require.resolve('tree-sitter-wasms/package.json');
  const path = await import('path');
  const pkgDir = path.dirname(pkgPath);
  return path.join(pkgDir, 'out', `${grammarName}.wasm`);
}

async function loadLanguage(lang: SupportedLanguage): Promise<Parser.Language> {
  const grammarName = GRAMMAR_MAP[lang];
  const wasmPath = await resolveWasmPath(grammarName);
  return Parser.Language.load(wasmPath);
}

/**
 * Get or create a cached parser for the given language.
 */
export async function getParser(lang: SupportedLanguage): Promise<Parser> {
  const cached = parserCache.get(lang);
  if (cached) return cached;

  await ensureInit();
  const parser = new Parser();
  const language = await loadLanguage(lang);
  parser.setLanguage(language);
  parserCache.set(lang, parser);
  return parser;
}

/**
 * Parse a file and return the tree-sitter tree with metadata.
 */
export async function parseFile(filePath: string): Promise<Result<ParsedFile, ParseFileError>> {
  const lang = detectLanguage(filePath);
  if (!lang) {
    return Err({
      code: 'UNSUPPORTED_LANGUAGE',
      message: `Unsupported file extension: ${filePath}`,
    });
  }

  const contentResult = await readFileContent(filePath);
  if (!contentResult.ok) {
    return Err({
      code: 'FILE_NOT_FOUND',
      message: `Cannot read file: ${filePath}`,
    });
  }

  try {
    const parser = await getParser(lang);
    const tree = parser.parse(contentResult.value);
    return Ok({ tree, language: lang, source: contentResult.value, filePath });
  } catch (e) {
    return Err({
      code: 'PARSE_FAILED',
      message: `Tree-sitter parse failed for ${filePath}: ${(e as Error).message}`,
    });
  }
}

/**
 * Reset the parser cache (for testing).
 */
export function resetParserCache(): void {
  parserCache.clear();
  initialized = false;
}
