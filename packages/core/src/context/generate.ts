import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ContextError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { AgentsMapConfig, GenerationSection } from './types';
import { findFiles } from '../shared/fs-utils';
import { relative, basename, dirname } from 'path';

/**
 * Default template sections for AGENTS.md
 */
const DEFAULT_SECTIONS: GenerationSection[] = [
  {
    name: 'Documentation',
    pattern: 'docs/**/*.md',
    description: 'Project documentation',
  },
  {
    name: 'Source Code',
    pattern: 'src/**/*.ts',
    description: 'Source code modules',
  },
];

/**
 * Group files by directory
 */
function groupByDirectory(files: string[], rootDir: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const file of files) {
    const relativePath = relative(rootDir, file);
    const dir = dirname(relativePath);

    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push(relativePath);
  }

  return groups;
}

/**
 * Format a file as a markdown link
 */
function formatFileLink(filePath: string): string {
  // Remove common extensions for display name
  const ext = filePath.match(/\.[^.]+$/)?.[0] || '';
  const name = basename(filePath, ext)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return `- [${name}](./${filePath})`;
}

/**
 * Check if a path matches an exclude pattern
 */
function matchesExcludePattern(relativePath: string, excludePatterns: string[]): boolean {
  return excludePatterns.some((pattern) => {
    // Escape regex special chars, then convert glob patterns
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    const regex = new RegExp('^' + escaped + '$');
    return regex.test(relativePath);
  });
}

/**
 * Generate AGENTS.md content from project structure
 */
export async function generateAgentsMap(
  config: AgentsMapConfig,
  graphSections?: Array<{ name: string; files: string[]; description?: string }>
): Promise<Result<string, ContextError>> {
  const { rootDir, includePaths, excludePaths, sections = DEFAULT_SECTIONS } = config;

  try {
    // Start building the AGENTS.md content
    const lines: string[] = [];

    // Header
    lines.push('# AI Agent Knowledge Map');
    lines.push('');
    lines.push('This is the single source of truth for AI agents working on this project.');
    lines.push('');

    // Project Overview section
    lines.push('## Project Overview');
    lines.push('');
    lines.push('> Add a brief description of this project, its purpose, and key technologies.');
    lines.push('');

    if (graphSections) {
      // Use graph-provided sections instead of glob-based discovery
      for (const section of graphSections) {
        lines.push(`## ${section.name}`);
        lines.push('');
        if (section.description) {
          lines.push(section.description);
          lines.push('');
        }
        for (const file of section.files.slice(0, 20)) {
          lines.push(formatFileLink(file));
        }
        if (section.files.length > 20) {
          lines.push(`- _... and ${section.files.length - 20} more files_`);
        }
        lines.push('');
      }
    } else {
      // Collect all files matching include patterns
      const allFiles: string[] = [];
      for (const pattern of includePaths) {
        const files = await findFiles(pattern, rootDir);
        allFiles.push(...files);
      }

      // Filter out excluded patterns
      const filteredFiles = allFiles.filter((file) => {
        const relativePath = relative(rootDir, file);
        return !matchesExcludePattern(relativePath, excludePaths);
      });

      // Repository Structure section
      lines.push('## Repository Structure');
      lines.push('');
      const grouped = groupByDirectory(filteredFiles, rootDir);
      for (const [dir, files] of grouped) {
        if (dir !== '.') {
          lines.push(`### ${dir}/`);
          lines.push('');
        }
        for (const file of files.slice(0, 10)) {
          // Limit to 10 files per directory
          lines.push(formatFileLink(file));
        }
        if (files.length > 10) {
          lines.push(`- _... and ${files.length - 10} more files_`);
        }
        lines.push('');
      }

      // Custom sections
      for (const section of sections) {
        lines.push(`## ${section.name}`);
        lines.push('');
        if (section.description) {
          lines.push(section.description);
          lines.push('');
        }

        const sectionFiles = await findFiles(section.pattern, rootDir);
        const filteredSectionFiles = sectionFiles.filter((file) => {
          const relativePath = relative(rootDir, file);
          return !matchesExcludePattern(relativePath, excludePaths);
        });

        for (const file of filteredSectionFiles.slice(0, 20)) {
          lines.push(formatFileLink(relative(rootDir, file)));
        }
        if (filteredSectionFiles.length > 20) {
          lines.push(`- _... and ${filteredSectionFiles.length - 20} more files_`);
        }
        lines.push('');
      }
    }

    // Development Workflow section
    lines.push('## Development Workflow');
    lines.push('');
    lines.push(
      '> Document your development workflow: branching strategy, testing commands, deployment process.'
    );
    lines.push('');

    return Ok(lines.join('\n'));
  } catch (error) {
    return Err(
      createError<ContextError>(
        'PARSE_ERROR',
        `Failed to generate AGENTS.md: ${(error as Error).message}`,
        { rootDir },
        ['Check directory permissions', 'Ensure glob patterns are valid']
      )
    );
  }
}
