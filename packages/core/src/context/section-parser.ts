import type { LoadingLevel } from '@harness-engineering/types';

export interface ParsedSection {
  heading: string;
  content: string;
  level: LoadingLevel;
}

/**
 * Section-to-level classification.
 * Level 1 (rules): Core operational instructions
 * Level 2 (spec): Success criteria and integration specs
 * Level 3 (source): Full reference content (default)
 * Level 4 (errors): Error handling and anti-patterns
 */
const SECTION_LEVEL_MAP: Record<string, LoadingLevel> = {
  Process: 1,
  Gates: 1,
  'Iron Law': 1,
  'Success Criteria': 2,
  'Session State': 2,
  'Harness Integration': 2,
  'When to Use': 2,
  Examples: 3,
  'Evidence Requirements': 3,
  'Party Mode': 3,
  'Rigor Levels': 3,
  'Change Specifications': 3,
  Escalation: 4,
  'Rationalizations to Reject': 4,
};

const DEFAULT_LEVEL: LoadingLevel = 3;

function classifyHeading(heading: string): LoadingLevel {
  return SECTION_LEVEL_MAP[heading] ?? DEFAULT_LEVEL;
}

function buildSection(heading: string, lines: string[]): ParsedSection {
  return { heading, content: lines.join('\n'), level: classifyHeading(heading) };
}

/**
 * Parse SKILL.md content into classified sections by H2 heading.
 */
export function parseSections(markdown: string): ParsedSection[] {
  if (!markdown.trim()) return [];

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sections: ParsedSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    if (!h2Match) {
      if (currentHeading !== null) currentLines.push(line);
      continue;
    }
    if (currentHeading !== null) {
      sections.push(buildSection(currentHeading, currentLines));
    }
    currentHeading = h2Match[1]!.trim();
    currentLines = [line];
  }

  if (currentHeading !== null) {
    sections.push(buildSection(currentHeading, currentLines));
  }

  return sections;
}

/**
 * Extract content from SKILL.md at a specific loading level.
 * Each level includes all content from previous levels (cumulative).
 * Level 5 returns the full content unchanged.
 */
export function extractLevel(content: string, level: LoadingLevel): string {
  if (!content.trim()) return '';
  if (level === 5) return content;

  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  // Extract preamble (everything before first ## heading)
  const firstH2Index = lines.findIndex((line) => /^## /.test(line));
  const preamble = firstH2Index === -1 ? content : lines.slice(0, firstH2Index).join('\n');

  if (firstH2Index === -1) {
    return content;
  }

  const sections = parseSections(content);
  const includedSections = sections.filter((s) => s.level <= level);

  if (includedSections.length === 0) {
    return preamble.trimEnd() + '\n';
  }

  const body = includedSections.map((s) => s.content).join('\n\n');
  const result = preamble.trimEnd() + '\n\n' + body.trimEnd();

  return (
    result +
    `\n\n<!-- context-budget: loaded at level ${level}/5 (${includedSections.length}/${sections.length} sections) -->\n`
  );
}
