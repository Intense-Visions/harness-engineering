import { findFiles } from '../shared/fs-utils';
import { getOutline } from './outline';
import { detectLanguage, EXTENSION_MAP } from './types';
import type { SearchResult, SearchMatch, CodeSymbol } from './types';
import * as path from 'path';

/**
 * Build a glob pattern for supported languages.
 */
function buildGlob(directory: string, fileGlob?: string): string {
  if (fileGlob) {
    return path.join(directory, '**', fileGlob);
  }
  const exts = Object.keys(EXTENSION_MAP).map((e) => e.slice(1)); // remove dot
  return path.join(directory, '**', `*.{${exts.join(',')}}`);
}

function matchesQuery(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.toLowerCase());
}

function flattenSymbols(symbols: CodeSymbol[]): CodeSymbol[] {
  const flat: CodeSymbol[] = [];
  for (const sym of symbols) {
    flat.push(sym);
    if (sym.children) {
      flat.push(...sym.children);
    }
  }
  return flat;
}

/**
 * Search for symbols matching a query across files in a directory.
 */
export async function searchSymbols(
  query: string,
  directory: string,
  fileGlob?: string
): Promise<SearchResult> {
  const pattern = buildGlob(directory, fileGlob);
  let files: string[];
  try {
    files = await findFiles(pattern, directory);
  } catch {
    files = [];
  }

  const matches: SearchMatch[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const lang = detectLanguage(file);
    if (!lang) {
      skipped.push(file);
      continue;
    }

    const outline = await getOutline(file);
    if (outline.error) {
      skipped.push(file);
      continue;
    }

    const allSymbols = flattenSymbols(outline.symbols);
    for (const sym of allSymbols) {
      if (matchesQuery(sym.name, query)) {
        matches.push({
          symbol: sym,
          context: sym.signature,
        });
      }
    }
  }

  return { query, matches, skipped };
}
