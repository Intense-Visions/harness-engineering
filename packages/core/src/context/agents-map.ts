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
