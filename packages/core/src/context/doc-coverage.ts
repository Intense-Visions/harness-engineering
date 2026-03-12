import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ContextError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { CoverageReport, CoverageOptions, DocumentationGap } from './types';
import { findFiles, readFileContent } from '../shared/fs-utils';
import { join, basename, relative } from 'path';
import { extractMarkdownLinks } from './agents-map';

/**
 * Determine importance of a file being documented
 */
function determineImportance(filePath: string): 'high' | 'medium' | 'low' {
  const name = basename(filePath).toLowerCase();

  // High importance: entry points, main files
  if (name === 'index.ts' || name === 'index.js' || name === 'main.ts') {
    return 'high';
  }

  // High importance: type definitions
  if (name.includes('types') || name.endsWith('.d.ts')) {
    return 'high';
  }

  // Low importance: tests, configs
  if (name.includes('.test.') || name.includes('.spec.') || name.includes('config')) {
    return 'low';
  }

  return 'medium';
}

/**
 * Suggest which documentation section a file belongs in
 */
function suggestSection(filePath: string, domain: string): string {
  const name = basename(filePath).toLowerCase();

  if (name.includes('types')) return 'API Types';
  if (name === 'index.ts' || name === 'index.js') return 'Module Exports';
  if (name.includes('util')) return 'Utilities';

  return `${domain} Reference`;
}

/**
 * Check documentation coverage for a domain
 */
export async function checkDocCoverage(
  domain: string,
  options: CoverageOptions = {}
): Promise<Result<CoverageReport, ContextError>> {
  const {
    docsDir = './docs',
    sourceDir = './src',
    excludePatterns = [],
  } = options;

  try {
    // Find all source files in the domain
    const sourceFiles = await findFiles('**/*.{ts,js,tsx,jsx}', sourceDir);

    // Filter out excluded patterns
    const filteredSourceFiles = sourceFiles.filter((file) => {
      const relativePath = relative(sourceDir, file);
      return !excludePatterns.some((pattern) => {
        // Escape regex special chars, then convert glob patterns
        const escaped = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
          .replace(/\*\*/g, '.*')                 // ** matches anything
          .replace(/\*/g, '[^/]*');               // * matches non-slash chars
        const regex = new RegExp('^' + escaped + '$');
        return regex.test(relativePath) || regex.test(file);
      });
    });

    // Find all documentation files
    const docFiles = await findFiles('**/*.md', docsDir);

    // Extract all links from documentation
    const documentedPaths = new Set<string>();

    for (const docFile of docFiles) {
      const contentResult = await readFileContent(docFile);
      if (contentResult.ok) {
        const links = extractMarkdownLinks(contentResult.value);
        for (const link of links) {
          // Normalize the path
          const normalizedPath = link.path
            .replace(/^\.\.\//, '')
            .replace(/^\.\//, '');
          documentedPaths.add(normalizedPath);

          // Also add just the filename for matching
          const linkBasename = basename(link.path);
          documentedPaths.add(linkBasename);
        }
      }
    }

    // Categorize files as documented or undocumented
    const documented: string[] = [];
    const undocumented: string[] = [];
    const gaps: DocumentationGap[] = [];

    for (const sourceFile of filteredSourceFiles) {
      const relativePath = relative(sourceDir, sourceFile);
      const fileName = basename(sourceFile);

      // Check if documented (by full path or filename)
      const isDocumented = documentedPaths.has(relativePath) ||
                          documentedPaths.has(fileName) ||
                          documentedPaths.has(`src/${relativePath}`);

      if (isDocumented) {
        documented.push(relativePath);
      } else {
        undocumented.push(relativePath);
        gaps.push({
          file: relativePath,
          suggestedSection: suggestSection(sourceFile, domain),
          importance: determineImportance(sourceFile),
        });
      }
    }

    // Calculate coverage percentage
    const total = documented.length + undocumented.length;
    const coveragePercentage = total > 0
      ? Math.round((documented.length / total) * 100)
      : 100;

    return Ok({
      domain,
      documented,
      undocumented,
      coveragePercentage,
      gaps,
    });
  } catch (error) {
    return Err(
      createError<ContextError>(
        'PARSE_ERROR',
        `Failed to analyze documentation coverage: ${(error as Error).message}`,
        { domain, docsDir, sourceDir },
        ['Ensure directories exist', 'Check file permissions']
      )
    );
  }
}
