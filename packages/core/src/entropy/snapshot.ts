import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { EntropyError, CodeBlock, InlineReference, DocumentationFile } from './types';
import { createEntropyError } from '../shared/errors';
import { readFileContent, fileExists } from '../shared/fs-utils';
import { join, resolve } from 'path';

/**
 * Resolve entry points for dead code analysis
 *
 * Entry points are the starting files from which reachability analysis begins.
 * The resolution order is:
 * 1. Explicit entries provided as arguments
 * 2. package.json exports/main/bin fields
 * 3. Conventional entry files (src/index.ts, index.ts, etc.)
 */
export async function resolveEntryPoints(
  rootDir: string,
  explicitEntries?: string[]
): Promise<Result<string[], EntropyError>> {
  // 1. Use explicit entries if provided
  if (explicitEntries && explicitEntries.length > 0) {
    const resolved = explicitEntries.map(e => resolve(rootDir, e));
    return Ok(resolved);
  }

  // 2. Try package.json
  const pkgPath = join(rootDir, 'package.json');
  if (await fileExists(pkgPath)) {
    const pkgContent = await readFileContent(pkgPath);
    if (pkgContent.ok) {
      try {
        const pkg = JSON.parse(pkgContent.value);
        const entries: string[] = [];

        // Check exports field
        if (pkg.exports) {
          if (typeof pkg.exports === 'string') {
            entries.push(resolve(rootDir, pkg.exports));
          } else if (typeof pkg.exports === 'object') {
            for (const value of Object.values(pkg.exports)) {
              if (typeof value === 'string') {
                entries.push(resolve(rootDir, value));
              }
            }
          }
        }

        // Check main field
        if (pkg.main && entries.length === 0) {
          entries.push(resolve(rootDir, pkg.main));
        }

        // Check bin field
        if (pkg.bin) {
          if (typeof pkg.bin === 'string') {
            entries.push(resolve(rootDir, pkg.bin));
          } else if (typeof pkg.bin === 'object') {
            for (const value of Object.values(pkg.bin)) {
              if (typeof value === 'string') {
                entries.push(resolve(rootDir, value));
              }
            }
          }
        }

        if (entries.length > 0) {
          return Ok(entries);
        }
      } catch {
        // Invalid JSON, fall through to conventions
      }
    }
  }

  // 3. Fall back to conventions
  const conventions = ['src/index.ts', 'src/main.ts', 'index.ts', 'main.ts'];
  for (const conv of conventions) {
    const convPath = join(rootDir, conv);
    if (await fileExists(convPath)) {
      return Ok([convPath]);
    }
  }

  return Err(
    createEntropyError(
      'ENTRY_POINT_NOT_FOUND',
      'Could not resolve entry points',
      { reason: 'No package.json exports/main and no conventional entry files found' },
      ['Add "exports" or "main" to package.json', 'Create src/index.ts', 'Specify entryPoints in config']
    )
  );
}

/**
 * Extract code blocks from markdown content
 */
function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const langMatch = line.match(/```(\w*)/);
      const language = langMatch?.[1] || 'text';

      // Find closing ```
      let codeContent = '';
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) {
        codeContent += lines[j] + '\n';
        j++;
      }

      blocks.push({
        language,
        content: codeContent.trim(),
        line: i + 1,
      });

      i = j; // Skip to end of code block
    }
  }

  return blocks;
}

/**
 * Extract inline backtick references from markdown
 */
function extractInlineRefs(content: string): InlineReference[] {
  const refs: InlineReference[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regex = /`([^`]+)`/g;
    let match;

    while ((match = regex.exec(line)) !== null) {
      const reference = match[1];
      // Filter out code snippets, keep likely symbol references
      if (reference.match(/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*(\(.*\))?$/)) {
        refs.push({
          reference: reference.replace(/\(.*\)$/, ''), // Remove function parens
          line: i + 1,
          column: match.index,
        });
      }
    }
  }

  return refs;
}

/**
 * Parse a documentation file
 */
export async function parseDocumentationFile(
  path: string
): Promise<Result<DocumentationFile, EntropyError>> {
  const contentResult = await readFileContent(path);
  if (!contentResult.ok) {
    return Err(
      createEntropyError(
        'PARSE_ERROR',
        `Failed to read documentation file: ${path}`,
        { file: path },
        ['Check that the file exists']
      )
    );
  }

  const content = contentResult.value;
  const type = path.endsWith('.md') ? 'markdown' : 'text';

  return Ok({
    path,
    type,
    content,
    codeBlocks: extractCodeBlocks(content),
    inlineRefs: extractInlineRefs(content),
  });
}
