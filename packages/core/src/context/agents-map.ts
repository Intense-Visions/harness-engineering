import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ContextError } from '../shared/errors';
import { createError } from '../shared/errors';
import type { AgentMapLink, AgentMapSection, AgentMapValidation } from './types';
import { REQUIRED_SECTIONS } from './types';
import { fileExists, readFileContent } from '../shared/fs-utils';
import { join, dirname } from 'path';

interface ExtractedLink {
  text: string;
  path: string;
  line: number;
}

/**
 * Extract markdown links from content
 * Pattern: [text](path)
 */
export function extractMarkdownLinks(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const lines = content.split('\n');

  // Markdown link pattern: [text](path)
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let match;
    linkPattern.lastIndex = 0; // Reset regex state for each line

    while ((match = linkPattern.exec(line)) !== null) {
      if (match[1] && match[2]) {
        links.push({
          text: match[1],
          path: match[2],
          line: i + 1, // 1-indexed
        });
      }
    }
  }

  return links;
}

interface SectionData {
  title: string;
  level: number;
  line: number;
  startIndex: number;
  endIndex?: number;
}

/**
 * Extract sections from markdown content
 * Pattern: # Heading or ## Heading etc.
 */
export function extractSections(content: string): AgentMapSection[] {
  const lines = content.split('\n');
  const sections: SectionData[] = [];

  // Heading pattern: # Title or ## Title etc.
  const headingPattern = /^(#{1,6})\s+(.+)$/;

  // First pass: find all headings
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = line.match(headingPattern);

    if (match && match[1] && match[2]) {
      sections.push({
        title: match[2].trim(),
        level: match[1].length,
        line: i + 1, // 1-indexed
        startIndex: i,
      });
    }
  }

  // Second pass: set end indices
  for (let i = 0; i < sections.length; i++) {
    const currentSection = sections[i];
    const nextSection = sections[i + 1];
    if (currentSection) {
      currentSection.endIndex = nextSection ? nextSection.startIndex : lines.length;
    }
  }

  // Third pass: extract links and description for each section
  return sections.map((section) => {
    const endIndex = section.endIndex ?? lines.length;
    const sectionLines = lines.slice(section.startIndex + 1, endIndex);
    const sectionContent = sectionLines.join('\n');

    const links = extractMarkdownLinks(sectionContent).map((link) => ({
      ...link,
      line: link.line + section.startIndex + 1, // Adjust line number
      exists: false, // Will be set later by validateAgentsMap
    }));

    // Extract description (first paragraph after heading)
    const descriptionLines: string[] = [];
    for (const line of sectionLines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        if (descriptionLines.length > 0) break;
        continue;
      }
      if (trimmed.startsWith('#')) break;
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) break;
      if (trimmed.startsWith('```')) break;
      descriptionLines.push(trimmed);
    }

    const result: AgentMapSection = {
      title: section.title,
      level: section.level,
      line: section.line,
      links,
    };
    if (descriptionLines.length > 0) {
      result.description = descriptionLines.join(' ');
    }
    return result;
  });
}

/**
 * Check if a link path is external (URL or fragment)
 */
function isExternalLink(path: string): boolean {
  return (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('#') ||
    path.startsWith('mailto:')
  );
}

/**
 * Resolve a link path relative to a base directory
 */
function resolveLinkPath(linkPath: string, baseDir: string): string {
  return linkPath.startsWith('.') ? join(baseDir, linkPath) : linkPath;
}

/**
 * Validate an AGENTS.md file
 * - Parses sections and links
 * - Checks for required sections
 * - Verifies all links point to existing files
 */
export async function validateAgentsMap(
  path: string = './AGENTS.md'
): Promise<Result<AgentMapValidation, ContextError>> {
  console.warn(
    '[harness] validateAgentsMap() is deprecated. Use graph-based validation via Assembler.checkCoverage() from @harness-engineering/graph'
  );

  // Read the file
  const contentResult = await readFileContent(path);
  if (!contentResult.ok) {
    return Err(
      createError<ContextError>(
        'PARSE_ERROR',
        `Failed to read AGENTS.md: ${contentResult.error.message}`,
        { path },
        ['Ensure the file exists', 'Check file permissions']
      )
    );
  }

  const content = contentResult.value;
  const sections = extractSections(content);
  const baseDir = dirname(path);

  // Check for required sections
  const sectionTitles = sections.map((s) => s.title);
  const missingSections = REQUIRED_SECTIONS.filter(
    (required) =>
      !sectionTitles.some((title) => title.toLowerCase().includes(required.toLowerCase()))
  );

  // Validate all links
  const allLinks: AgentMapLink[] = [];
  const brokenLinks: AgentMapLink[] = [];

  for (const section of sections) {
    for (const link of section.links) {
      // Skip external links (URLs, fragments, mailto)
      if (isExternalLink(link.path)) {
        const externalLink: AgentMapLink = { ...link, exists: true };
        allLinks.push(externalLink);
        continue;
      }

      // Resolve and check local paths
      const absolutePath = resolveLinkPath(link.path, baseDir);
      const exists = await fileExists(absolutePath);
      const fullLink: AgentMapLink = { ...link, exists };

      allLinks.push(fullLink);
      if (!exists) {
        brokenLinks.push(fullLink);
      }
    }

    // Update section links with exists status
    section.links = section.links.map(
      (link) =>
        allLinks.find((l) => l.path === link.path && l.line === link.line) || {
          ...link,
          exists: false,
        }
    );
  }

  const valid = missingSections.length === 0 && brokenLinks.length === 0;

  return Ok({
    valid,
    sections,
    totalLinks: allLinks.length,
    brokenLinks,
    missingSections: [...missingSections],
  });
}
