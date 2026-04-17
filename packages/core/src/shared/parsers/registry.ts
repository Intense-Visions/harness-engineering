import type { LanguageParser } from './base';
import { TypeScriptParser } from './typescript';
import { createTreeSitterParser } from './tree-sitter';
import { detectLanguage, EXTENSION_MAP } from '../../code-nav/types';
import type { SupportedLanguage } from '../../code-nav/types';

/**
 * Registry of language parsers.
 * Maps languages to their LanguageParser implementation.
 * Provides lookup by file path or language name.
 */
export class ParserRegistry {
  private readonly parsers = new Map<string, LanguageParser>();

  register(parser: LanguageParser): void {
    this.parsers.set(parser.name, parser);
  }

  getByLanguage(lang: string): LanguageParser | null {
    return this.parsers.get(lang) ?? null;
  }

  getForFile(filePath: string): LanguageParser | null {
    const lang = detectLanguage(filePath);
    if (!lang) return null;
    return this.getByLanguage(lang);
  }

  getSupportedExtensions(): string[] {
    return Object.keys(EXTENSION_MAP);
  }

  getSupportedLanguages(): string[] {
    return Array.from(this.parsers.keys());
  }

  isSupportedExtension(ext: string): boolean {
    return ext in EXTENSION_MAP;
  }
}

let defaultRegistry: ParserRegistry | null = null;

/**
 * Get the default parser registry with all built-in parsers registered.
 */
export function getDefaultRegistry(): ParserRegistry {
  if (defaultRegistry) return defaultRegistry;

  const registry = new ParserRegistry();

  // TypeScript & JavaScript use the ESTree-based parser
  const tsParser = new TypeScriptParser();
  registry.register(tsParser);

  // JavaScript reuses the TypeScript parser (ESTree handles both)
  registry.register({
    name: 'javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    parseFile: tsParser.parseFile.bind(tsParser),
    extractImports: tsParser.extractImports.bind(tsParser),
    extractExports: tsParser.extractExports.bind(tsParser),
    health: tsParser.health.bind(tsParser),
  });

  // Tree-sitter-based parsers for Python, Go, Rust, Java
  const treeSitterLanguages: SupportedLanguage[] = ['python', 'go', 'rust', 'java'];
  for (const lang of treeSitterLanguages) {
    const parser = createTreeSitterParser(lang);
    if (parser) {
      registry.register(parser);
    }
  }

  defaultRegistry = registry;
  return registry;
}

/**
 * Reset the default registry (for testing).
 */
export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}
