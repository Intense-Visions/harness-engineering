import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ContextError } from '../shared/errors';
import { createError } from '../shared/errors';
import type {
  AgentMapLink,
  AgentMapSection,
  AgentMapValidation,
} from './types';
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
    const line = lines[i];
    let match;
    linkPattern.lastIndex = 0; // Reset regex state for each line

    while ((match = linkPattern.exec(line)) !== null) {
      links.push({
        text: match[1],
        path: match[2],
        line: i + 1, // 1-indexed
      });
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
    const line = lines[i];
    const match = line.match(headingPattern);

    if (match) {
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
    const nextSection = sections[i + 1];
    sections[i].endIndex = nextSection ? nextSection.startIndex : lines.length;
  }

  // Third pass: extract links and description for each section
  return sections.map((section) => {
    const sectionLines = lines.slice(section.startIndex + 1, section.endIndex);
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

    return {
      title: section.title,
      level: section.level,
      line: section.line,
      links,
      description: descriptionLines.length > 0 ? descriptionLines.join(' ') : undefined,
    };
  });
}
