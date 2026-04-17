import { sanitizePath } from '../utils/sanitize-path.js';

// --- code_outline ---

export const codeOutlineDefinition = {
  name: 'code_outline',
  description:
    'Get a structural skeleton of a file or files matching a glob: exports, classes, functions, types with signatures and line numbers. No implementation bodies. 4-8x token savings vs full file read.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description:
          'Absolute file path or directory path. When a directory, outlines all supported files within it.',
      },
      glob: {
        type: 'string',
        description:
          'Optional glob pattern to filter files (e.g. "*.ts", "src/**/*.py"). Only used when path is a directory.',
      },
      offset: {
        type: 'number',
        description:
          'Number of file entries to skip (pagination, directory mode only). Default: 0. Files are sorted by modification time desc.',
      },
      limit: {
        type: 'number',
        description: 'Max file entries to return (pagination, directory mode only). Default: 30.',
      },
    },
    required: ['path'],
  },
};

export async function handleCodeOutline(input: {
  path: string;
  glob?: string;
  offset?: number;
  limit?: number;
}) {
  let targetPath: string;
  try {
    targetPath = sanitizePath(input.path);
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const { getOutline, formatOutline, EXTENSION_MAP } = await import('@harness-engineering/core');
    const { stat } = await import('fs/promises');

    const stats = await stat(targetPath).catch(() => null);

    if (stats?.isFile()) {
      const outline = await getOutline(targetPath);
      return { content: [{ type: 'text' as const, text: formatOutline(outline) }] };
    }

    if (stats?.isDirectory()) {
      const { glob } = await import('glob');
      const exts = Object.keys(EXTENSION_MAP).map((e) => e.slice(1));
      const pattern = input.glob ?? `**/*.{${exts.join(',')}}`;
      const files = await glob(pattern, { cwd: targetPath, absolute: true });

      // Sort files by modification time desc for relevance-based pagination
      const fileStats = await Promise.all(
        files.map(async (f) => {
          const fStat = await stat(f).catch(() => null);
          return { path: f, mtimeMs: fStat?.mtimeMs ?? 0 };
        })
      );
      fileStats.sort((a, b) => b.mtimeMs - a.mtimeMs);

      const { paginate } = await import('@harness-engineering/core');
      const paged = paginate(fileStats, input.offset ?? 0, input.limit ?? 30);

      const results: string[] = [];
      for (const entry of paged.items) {
        const outline = await getOutline(entry.path);
        results.push(formatOutline(outline));
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              outlines: results.join('\n\n'),
              pagination: paged.pagination,
            }),
          },
        ],
      };
    }

    return {
      content: [{ type: 'text' as const, text: `Error: Path not found: ${targetPath}` }],
      isError: true,
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// --- code_search ---

export const codeSearchDefinition = {
  name: 'code_search',
  description:
    'Search for symbols (functions, classes, types, variables) by name or pattern across a directory. Returns matching locations with file, line, kind, and one-line context. 6-12x token savings vs grep + read.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Symbol name or substring to search for (case-insensitive).',
      },
      directory: {
        type: 'string',
        description: 'Absolute path to directory to search in.',
      },
      glob: {
        type: 'string',
        description: 'Optional glob pattern to filter files (e.g. "*.ts").',
      },
    },
    required: ['query', 'directory'],
  },
};

export async function handleCodeSearch(input: { query: string; directory: string; glob?: string }) {
  let directory: string;
  try {
    directory = sanitizePath(input.directory);
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const { searchSymbols } = await import('@harness-engineering/core');
    const result = await searchSymbols(input.query, directory, input.glob);

    const lines: string[] = [`Search: "${result.query}" — ${result.matches.length} matches`];
    for (const match of result.matches) {
      const { symbol } = match;
      lines.push(
        `  ${symbol.file}:${symbol.line} [${symbol.kind}] ${symbol.name} — ${match.context}`
      );
    }
    if (result.skipped.length > 0) {
      lines.push(`\nSkipped ${result.skipped.length} files (unsupported or parse failed)`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// --- code_unfold ---

export const codeUnfoldDefinition = {
  name: 'code_unfold',
  description:
    'Extract the complete implementation of a specific symbol (function, class, type) or a line range from a file. Uses AST boundaries for precise extraction. 2-4x token savings vs full file read.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file.',
      },
      symbol: {
        type: 'string',
        description:
          'Name of the symbol to extract (function, class, type, etc.). Mutually exclusive with startLine/endLine.',
      },
      startLine: {
        type: 'number',
        description:
          'Start line number (1-indexed). Used with endLine for range extraction. Mutually exclusive with symbol.',
      },
      endLine: {
        type: 'number',
        description:
          'End line number (1-indexed, inclusive). Used with startLine for range extraction.',
      },
    },
    required: ['path'],
  },
};

export async function handleCodeUnfold(input: {
  path: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
}) {
  let filePath: string;
  try {
    filePath = sanitizePath(input.path);
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }

  try {
    if (input.symbol) {
      const { unfoldSymbol } = await import('@harness-engineering/core');
      const result = await unfoldSymbol(filePath, input.symbol);
      const header = result.warning
        ? `${result.file}:${result.startLine}-${result.endLine} ${result.warning}\n`
        : `${result.file}:${result.startLine}-${result.endLine}\n`;
      return { content: [{ type: 'text' as const, text: header + result.content }] };
    }

    if (input.startLine != null && input.endLine != null) {
      const { unfoldRange } = await import('@harness-engineering/core');
      const result = await unfoldRange(filePath, input.startLine, input.endLine);
      const header = `${result.file}:${result.startLine}-${result.endLine}\n`;
      return { content: [{ type: 'text' as const, text: header + result.content }] };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: 'Error: Provide either "symbol" or "startLine" + "endLine".',
        },
      ],
      isError: true,
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
