import { parseFile } from './parser';
import { getOutline } from './outline';
import { readFileContent } from '../shared/fs-utils';
import { detectLanguage } from './types';
import type { UnfoldResult, CodeSymbol } from './types';

function findSymbolInList(symbols: CodeSymbol[], name: string): CodeSymbol | null {
  for (const sym of symbols) {
    if (sym.name === name) return sym;
    if (sym.children) {
      const found = findSymbolInList(sym.children, name);
      if (found) return found;
    }
  }
  return null;
}

function extractLines(source: string, startLine: number, endLine: number): string {
  const lines = source.split('\n');
  const start = Math.max(0, startLine - 1); // 1-indexed to 0-indexed
  const end = Math.min(lines.length, endLine);
  return lines.slice(start, end).join('\n');
}

function buildFallbackResult(
  filePath: string,
  symbolName: string,
  content: string,
  language: UnfoldResult['language']
): UnfoldResult {
  const totalLines = content ? content.split('\n').length : 0;
  return {
    file: filePath,
    symbolName,
    startLine: content ? 1 : 0,
    endLine: totalLines,
    content,
    language,
    fallback: true,
    warning: '[fallback: raw content]',
  };
}

async function readContentSafe(filePath: string): Promise<string> {
  const result = await readFileContent(filePath);
  return result.ok ? result.value : '';
}

/**
 * Extract a specific symbol's implementation from a file by name.
 */
export async function unfoldSymbol(filePath: string, symbolName: string): Promise<UnfoldResult> {
  const lang = detectLanguage(filePath);

  // Unsupported language — fall back to raw content
  if (!lang) {
    const content = await readContentSafe(filePath);
    return buildFallbackResult(filePath, symbolName, content, 'unknown');
  }

  const outline = await getOutline(filePath);
  if (outline.error) {
    const content = await readContentSafe(filePath);
    return buildFallbackResult(filePath, symbolName, content, lang);
  }

  const symbol = findSymbolInList(outline.symbols, symbolName);
  if (!symbol) {
    const content = await readContentSafe(filePath);
    return buildFallbackResult(filePath, symbolName, content, lang);
  }

  const parseResult = await parseFile(filePath);
  if (!parseResult.ok) {
    const content = await readContentSafe(filePath);
    return {
      ...buildFallbackResult(
        filePath,
        symbolName,
        extractLines(content, symbol.line, symbol.endLine),
        lang
      ),
      startLine: symbol.line,
      endLine: symbol.endLine,
    };
  }

  const content = extractLines(parseResult.value.source, symbol.line, symbol.endLine);
  return {
    file: filePath,
    symbolName,
    startLine: symbol.line,
    endLine: symbol.endLine,
    content,
    language: lang,
    fallback: false,
  };
}

/**
 * Extract a range of lines from a file.
 */
export async function unfoldRange(
  filePath: string,
  startLine: number,
  endLine: number
): Promise<UnfoldResult> {
  const lang = detectLanguage(filePath) ?? 'unknown';
  const contentResult = await readFileContent(filePath);
  if (!contentResult.ok) {
    return {
      file: filePath,
      startLine: 0,
      endLine: 0,
      content: '',
      language: lang as UnfoldResult['language'],
      fallback: true,
      warning: '[fallback: raw content]',
    };
  }

  const totalLines = contentResult.value.split('\n').length;
  const clampedEnd = Math.min(endLine, totalLines);
  const content = extractLines(contentResult.value, startLine, clampedEnd);

  return {
    file: filePath,
    startLine,
    endLine: clampedEnd,
    content,
    language: lang as UnfoldResult['language'],
    fallback: false,
  };
}
