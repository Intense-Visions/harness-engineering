import { describe, it, expect } from 'vitest';
import { buildDependencyGraph } from '../../src/constraints/dependencies';
import type { ParserLookup } from '../../src/constraints/dependencies';
import type { LanguageParser, AST, Import, Export } from '../../src/shared/parsers/base';
import { Ok } from '../../src/shared/result';

function makeMockParser(
  lang: string,
  extensions: string[],
  imports: Record<string, Import[]>
): LanguageParser {
  return {
    name: lang,
    extensions,
    parseFile: async (path: string) =>
      Ok({ type: 'Program', body: {}, language: lang } as AST),
    extractImports: (ast: AST) => {
      // Return imports based on language
      const key = Object.keys(imports).find((k) => ast.language === lang) ?? '';
      return Ok(imports[key] ?? []);
    },
    extractExports: () => Ok([] as Export[]),
    health: async () => Ok({ available: true }),
  };
}

describe('Multi-language dependency graph', () => {
  it('should resolve Python imports with .py extension', async () => {
    const pyParser = makeMockParser('python', ['.py'], {
      python: [
        {
          source: './utils',
          specifiers: ['hash_password'],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });

    const result = await buildDependencyGraph(
      ['/project/src/auth.py'],
      pyParser
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should resolve with .py extension, not .ts
      const pyEdge = result.value.edges.find((e) => e.from.includes('auth.py'));
      expect(pyEdge?.to).toContain('.py');
      expect(pyEdge?.to).not.toContain('.ts');
    }
  });

  it('should resolve Go imports with .go extension', async () => {
    const goParser = makeMockParser('go', ['.go'], {
      go: [
        {
          source: './services',
          specifiers: [],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });

    const result = await buildDependencyGraph(
      ['/project/src/main.go'],
      goParser
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const goEdge = result.value.edges.find((e) => e.from.includes('main.go'));
      expect(goEdge?.to).toContain('.go');
    }
  });

  it('should accept a ParserLookup for multi-language projects', async () => {
    const tsParser = makeMockParser('typescript', ['.ts'], {
      typescript: [
        {
          source: './utils',
          specifiers: ['hash'],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });
    const pyParser = makeMockParser('python', ['.py'], {
      python: [
        {
          source: './helpers',
          specifiers: ['compute'],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });

    const lookup: ParserLookup = {
      getForFile(filePath: string) {
        if (filePath.endsWith('.ts')) return tsParser;
        if (filePath.endsWith('.py')) return pyParser;
        return null;
      },
    };

    const result = await buildDependencyGraph(
      ['/project/src/app.ts', '/project/src/app.py'],
      lookup
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have edges from both files
      const tsEdge = result.value.edges.find((e) => e.from.includes('.ts'));
      const pyEdge = result.value.edges.find((e) => e.from.includes('.py'));
      expect(tsEdge).toBeDefined();
      expect(pyEdge).toBeDefined();
      // TypeScript file should resolve to .ts, Python to .py
      expect(tsEdge?.to).toContain('.ts');
      expect(pyEdge?.to).toContain('.py');
    }
  });

  it('should skip files without a matching parser in ParserLookup', async () => {
    const lookup: ParserLookup = {
      getForFile(_filePath: string) {
        return null; // No parser available
      },
    };

    const result = await buildDependencyGraph(
      ['/project/unknown.xyz'],
      lookup
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.edges).toHaveLength(0);
    }
  });

  it('should still accept a single LanguageParser for backward compat', async () => {
    const parser = makeMockParser('typescript', ['.ts', '.tsx'], {
      typescript: [],
    });

    const result = await buildDependencyGraph(
      ['/project/src/index.ts'],
      parser
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(1);
    }
  });
});
