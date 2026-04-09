import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CriticalPathEntry, CriticalPathSet } from './types';

export interface GraphCriticalPathData {
  highFanInFunctions: Array<{ file: string; function: string; fanIn: number }>;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const FUNCTION_DECL_RE = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/;
const CONST_DECL_RE = /(?:export\s+)?(?:const|let)\s+(\w+)\s*=/;

/**
 * Merge graph-inferred high-fan-in functions into the seen map, skipping duplicates.
 * Returns the count of newly added entries.
 */
function mergeGraphInferred(
  highFanInFunctions: GraphCriticalPathData['highFanInFunctions'],
  seen: Map<string, CriticalPathEntry>
): number {
  let added = 0;
  for (const item of highFanInFunctions) {
    const key = `${item.file}::${item.function}`;
    if (!seen.has(key)) {
      seen.set(key, {
        file: item.file,
        function: item.function,
        source: 'graph-inferred',
        fanIn: item.fanIn,
      });
      added++;
    }
  }
  return added;
}

function isCommentOrBlank(line: string): boolean {
  return line === '' || line === '*/' || line === '*' || line.startsWith('*') || line.startsWith('//');
}

function matchDeclarationName(line: string): string | null {
  const funcMatch = line.match(FUNCTION_DECL_RE);
  if (funcMatch?.[1]) return funcMatch[1];
  const constMatch = line.match(CONST_DECL_RE);
  if (constMatch?.[1]) return constMatch[1];
  return null;
}

export class CriticalPathResolver {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async resolve(graphData?: GraphCriticalPathData): Promise<CriticalPathSet> {
    const annotated = await this.scanAnnotations();
    const seen = new Map<string, CriticalPathEntry>();

    // Annotations take priority
    for (const entry of annotated) {
      const key = `${entry.file}::${entry.function}`;
      seen.set(key, entry);
    }

    // Add graph-inferred entries, skipping duplicates
    const graphInferred = graphData
      ? mergeGraphInferred(graphData.highFanInFunctions, seen)
      : 0;

    const entries = Array.from(seen.values());

    return {
      entries,
      stats: {
        annotated: annotated.length,
        graphInferred,
        total: entries.length,
      },
    };
  }

  private async scanAnnotations(): Promise<CriticalPathEntry[]> {
    const entries: CriticalPathEntry[] = [];
    this.walkDir(this.projectRoot, entries);
    return entries;
  }

  private walkDir(dir: string, entries: CriticalPathEntry[]): void {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      if (item.isDirectory()) {
        if (SKIP_DIRS.has(item.name)) continue;
        this.walkDir(path.join(dir, item.name), entries);
      } else if (item.isFile() && SOURCE_EXTENSIONS.has(path.extname(item.name))) {
        this.scanFile(path.join(dir, item.name), entries);
      }
    }
  }

  private resolveFunctionName(lines: string[], fromIndex: number): string | null {
    for (let j = fromIndex; j < lines.length; j++) {
      const nextLine = lines[j]!.trim();
      if (isCommentOrBlank(nextLine)) continue;
      return matchDeclarationName(nextLine);
    }
    return null;
  }

  private scanFile(filePath: string, entries: CriticalPathEntry[]): void {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return;
    }

    const lines = content.split('\n');
    const relativePath = path.relative(this.projectRoot, filePath).replace(/\\/g, '/');

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]!.includes('@perf-critical')) continue;

      const fnName = this.resolveFunctionName(lines, i + 1);
      if (fnName) {
        entries.push({ file: relativePath, function: fnName, source: 'annotation' });
      }
    }
  }
}
