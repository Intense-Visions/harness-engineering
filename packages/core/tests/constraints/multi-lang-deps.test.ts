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
    parseFile: async (path: string) => Ok({ type: 'Program', body: {}, language: lang } as AST),
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

    const result = await buildDependencyGraph(['/project/src/auth.py'], pyParser);

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

    const result = await buildDependencyGraph(['/project/src/main.go'], goParser);

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

    const result = await buildDependencyGraph(['/project/unknown.xyz'], lookup);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.edges).toHaveLength(0);
    }
  });

  it('should resolve Rust imports with .rs extension', async () => {
    const rsParser = makeMockParser('rust', ['.rs'], {
      rust: [
        {
          source: './utils',
          specifiers: [],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });

    const result = await buildDependencyGraph(['/project/src/lib.rs'], rsParser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const rsEdge = result.value.edges.find((e) => e.from.includes('lib.rs'));
      expect(rsEdge?.to).toContain('.rs');
    }
  });

  it('should resolve Java imports with .java extension', async () => {
    const javaParser = makeMockParser('java', ['.java'], {
      java: [
        {
          source: './services',
          specifiers: [],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });

    const result = await buildDependencyGraph(['/project/src/Main.java'], javaParser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const javaEdge = result.value.edges.find((e) => e.from.includes('Main.java'));
      expect(javaEdge?.to).toContain('.java');
    }
  });

  it('should handle imports that already have a known extension', async () => {
    const pyParser = makeMockParser('python', ['.py'], {
      python: [
        {
          source: './utils.py',
          specifiers: [],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });

    const result = await buildDependencyGraph(['/project/src/app.py'], pyParser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const edge = result.value.edges[0];
      // Should not double-append extension
      expect(edge?.to).toContain('.py');
      expect(edge?.to).not.toContain('.py.py');
    }
  });

  it('should resolve JavaScript imports with .js extension', async () => {
    const jsParser = makeMockParser('javascript', ['.js'], {
      javascript: [
        {
          source: './helper',
          specifiers: [],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });

    const result = await buildDependencyGraph(['/project/src/index.js'], jsParser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const jsEdge = result.value.edges.find((e) => e.from.includes('index.js'));
      expect(jsEdge?.to).toContain('.js');
    }
  });

  it('should handle type-only imports', async () => {
    const tsParser = makeMockParser('typescript', ['.ts'], {
      typescript: [
        {
          source: './types',
          specifiers: ['User'],
          location: { file: '', line: 1, column: 0 },
          kind: 'type' as const,
        },
      ],
    });

    const result = await buildDependencyGraph(['/project/src/service.ts'], tsParser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const edge = result.value.edges[0];
      expect(edge?.importType).toBe('type-only');
    }
  });

  it('should skip external package imports (no relative path)', async () => {
    const tsParser = makeMockParser('typescript', ['.ts'], {
      typescript: [
        {
          source: 'lodash',
          specifiers: ['get'],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });

    const result = await buildDependencyGraph(['/project/src/index.ts'], tsParser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // External packages should be skipped
      expect(result.value.edges).toHaveLength(0);
    }
  });

  it('should handle absolute path imports', async () => {
    const tsParser = makeMockParser('typescript', ['.ts'], {
      typescript: [
        {
          source: '/absolute/path/module',
          specifiers: [],
          location: { file: '', line: 1, column: 0 },
          kind: 'value' as const,
        },
      ],
    });

    const result = await buildDependencyGraph(['/project/src/index.ts'], tsParser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.edges).toHaveLength(1);
      expect(result.value.edges[0]?.to).toContain('.ts');
    }
  });

  it('should use graph dependency data when provided', async () => {
    const tsParser = makeMockParser('typescript', ['.ts'], { typescript: [] });

    const result = await buildDependencyGraph([], tsParser, {
      nodes: ['a.ts', 'b.ts'],
      edges: [{ from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toEqual(['a.ts', 'b.ts']);
      expect(result.value.edges).toHaveLength(1);
    }
  });

  it('should handle parser that fails to parse files', async () => {
    const failParser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts'],
      parseFile: async () => ({
        ok: false as const,
        error: {
          code: 'SYNTAX_ERROR' as const,
          message: 'Parse failed',
          details: {},
          suggestions: [],
        },
      }),
      extractImports: () => Ok([] as Import[]),
      extractExports: () => Ok([] as Export[]),
      health: async () => Ok({ available: true }),
    };

    const result = await buildDependencyGraph(['/project/src/broken.ts'], failParser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // File should be skipped but still in nodes
      expect(result.value.nodes).toHaveLength(1);
      expect(result.value.edges).toHaveLength(0);
    }
  });

  it('should handle parser that fails to extract imports', async () => {
    const failExtractParser: LanguageParser = {
      name: 'typescript',
      extensions: ['.ts'],
      parseFile: async () => Ok({ type: 'Program', body: {}, language: 'typescript' } as AST),
      extractImports: () => ({
        ok: false as const,
        error: {
          code: 'SYNTAX_ERROR' as const,
          message: 'Extract failed',
          details: {},
          suggestions: [],
        },
      }),
      extractExports: () => Ok([] as Export[]),
      health: async () => Ok({ available: true }),
    };

    const result = await buildDependencyGraph(['/project/src/index.ts'], failExtractParser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.edges).toHaveLength(0);
    }
  });

  it('should still accept a single LanguageParser for backward compat', async () => {
    const parser = makeMockParser('typescript', ['.ts', '.tsx'], {
      typescript: [],
    });

    const result = await buildDependencyGraph(['/project/src/index.ts'], parser);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(1);
    }
  });
});
