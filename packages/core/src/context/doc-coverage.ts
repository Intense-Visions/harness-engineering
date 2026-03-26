import { minimatch } from 'minimatch';
import { basename } from 'path';
import { createError, type ContextError } from '../shared/errors';
import { findFiles, readFileContent, relativePosix } from '../shared/fs-utils';
import { Err, Ok, type Result } from '../shared/result';
import { extractMarkdownLinks } from './agents-map';
import type { CoverageOptions, CoverageReport, DocumentationGap } from './types';

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
  const { docsDir = './docs', sourceDir = '.', excludePatterns = [], graphCoverage } = options;

  // When graph coverage is provided, use pre-computed results
  if (graphCoverage) {
    const gaps: DocumentationGap[] = graphCoverage.undocumented.map((file) => ({
      file,
      suggestedSection: suggestSection(file, domain),
      importance: determineImportance(file),
    }));

    return Ok({
      domain,
      documented: graphCoverage.documented,
      undocumented: graphCoverage.undocumented,
      coveragePercentage: graphCoverage.coveragePercentage,
      gaps,
    });
  }

  try {
    // Find all source files in the domain
    const sourceFiles = await findFiles('**/*.{ts,js,tsx,jsx}', sourceDir);

    // Filter out excluded patterns
    const filteredSourceFiles = sourceFiles.filter((file) => {
      const relativePath = relativePosix(sourceDir, file);
      return !excludePatterns.some((pattern) => {
        return (
          minimatch(relativePath, pattern, { dot: true }) || minimatch(file, pattern, { dot: true })
        );
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
          const normalizedPath = link.path.replace(/^\.\.\//, '').replace(/^\.\//, '');
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
      const relativePath = relativePosix(sourceDir, sourceFile);
      const fileName = basename(sourceFile);

      // Check if documented (by full path or filename)
      const isDocumented =
        documentedPaths.has(relativePath) ||
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
    const coveragePercentage = total > 0 ? Math.round((documented.length / total) * 100) : 100;

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
