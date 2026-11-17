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
 * Check if a line terminates description extraction.
 */
function isDescriptionTerminator(trimmed: string): boolean {
  return (
    trimmed.startsWith('#') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('```')
  );
}

/**
 * Extract the first paragraph description from a set of lines.
 */
function extractDescription(sectionLines: string[]): string | undefined {
  const descriptionLines: string[] = [];
  for (const line of sectionLines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (descriptionLines.length > 0) break;
      continue;
    }
    if (isDescriptionTerminator(trimmed)) break;
    descriptionLines.push(trimmed);
  }
  return descriptionLines.length > 0 ? descriptionLines.join(' ') : undefined;
}

/**
 * Convert a SectionData into an AgentMapSection with links and description.
 */
function buildAgentMapSection(section: SectionData, lines: string[]): AgentMapSection {
  const endIndex = section.endIndex ?? lines.length;
  const sectionLines = lines.slice(section.startIndex + 1, endIndex);
  const sectionContent = sectionLines.join('\n');

  const links = extractMarkdownLinks(sectionContent).map((link) => ({
    ...link,
    line: link.line + section.startIndex + 1,
    exists: false,
  }));

  const result: AgentMapSection = {
    title: section.title,
    level: section.level,
    line: section.line,
    links,
  };

  const description = extractDescription(sectionLines);
  if (description) {
    result.description = description;
  }

  return result;
}

/**
 * Extract sections from markdown content
 * Pattern: # Heading or ## Heading etc.
 */
export function extractSections(content: string): AgentMapSection[] {
  const lines = content.split('\n');
  const sections: SectionData[] = [];
  const headingPattern = /^(#{1,6})\s+(.+)$/;

  // First pass: find all headings
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = line.match(headingPattern);
    if (match && match[1] && match[2]) {
      sections.push({
        title: match[2].trim(),
        level: match[1].length,
        line: i + 1,
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

  // Third pass: build AgentMapSections
  return sections.map((section) => buildAgentMapSection(section, lines));
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

/**
 * The ONE severity of a missing required AGENTS.md section, on every surface
 * that runs the section check (#2669).
 *
 * A missing section is advisory: it is surfaced, but it never flips a verdict.
 * `harness ci check` and the review mechanical checks have always reported it at
 * `warning`, and `harness validate` never blocked on it. MCP `validate_project`
 * used to block on it, so the same tree read valid on one surface and invalid on
 * another. Every surface now derives the finding from
 * {@link agentsMapSectionFindings} instead of restating its own severity.
 */
export const AGENTS_MAP_MISSING_SECTION_SEVERITY = 'warning' as const;

/** One missing required AGENTS.md section, as every surface reports it. */
export interface AgentsMapSectionFinding {
  section: string;
  severity: typeof AGENTS_MAP_MISSING_SECTION_SEVERITY;
  message: string;
}

/**
 * The shared verdict for the AGENTS.md required-section check: one finding per
 * missing section, at {@link AGENTS_MAP_MISSING_SECTION_SEVERITY}, with one
 * message shape. MCP `validate_project`, `harness validate`, `harness ci check`
 * and the review mechanical checks all report exactly these findings.
 */
export function agentsMapSectionFindings(
  validation: Pick<AgentMapValidation, 'missingSections'>
): AgentsMapSectionFinding[] {
  return validation.missingSections.map((section) => ({
    section,
    severity: AGENTS_MAP_MISSING_SECTION_SEVERITY,
    message: `Missing section: ${section}`,
  }));
}
