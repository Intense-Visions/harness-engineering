import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ContextError } from '../shared/errors';
import type { BrokenLink, IntegrityReport } from './types';
import { validateAgentsMap } from './agents-map';
import { findFiles } from '../shared/fs-utils';
import { join, basename, relative } from 'path';

/**
 * Suggest a fix for a broken link
 */
function suggestFix(path: string, existingFiles: string[]): string {
  const targetName = basename(path).toLowerCase();

  // Try to find similar files
  const similar = existingFiles.find((file) => {
    const fileName = basename(file).toLowerCase();
    return fileName.includes(targetName) || targetName.includes(fileName);
  });

  if (similar) {
    return `Did you mean "${similar}"?`;
  }

  return `Create the file "${path}" or remove the link`;
}

/**
 * Validate knowledge map integrity (all links in AGENTS.md and docs)
 */
export async function validateKnowledgeMap(
  rootDir: string = process.cwd()
): Promise<Result<IntegrityReport, ContextError>> {
  const agentsPath = join(rootDir, 'AGENTS.md');

  // Get validation from AGENTS.md
  const agentsResult = await validateAgentsMap(agentsPath);

  if (!agentsResult.ok) {
    return Err(agentsResult.error);
  }

  const {
    sections,
    brokenLinks: agentsBrokenLinks,
    totalLinks: agentsTotalLinks,
  } = agentsResult.value;

  // Get all existing files in the project for suggestions
  const existingFiles = await findFiles('**/*', rootDir);
  const relativeExistingFiles = existingFiles.map((f) => relative(rootDir, f));

  // Convert to BrokenLink format with suggestions
  const brokenLinks: BrokenLink[] = agentsBrokenLinks.map((link) => {
    // Find which section this link belongs to
    const section = sections.find((s) =>
      s.links.some((l) => l.path === link.path && l.line === link.line)
    );

    return {
      text: link.text,
      path: link.path,
      line: link.line,
      section: section?.title || 'Unknown',
      reason: 'NOT_FOUND' as const,
      suggestion: suggestFix(link.path, relativeExistingFiles),
    };
  });

  const validLinks = agentsTotalLinks - brokenLinks.length;
  const integrity = agentsTotalLinks > 0 ? Math.round((validLinks / agentsTotalLinks) * 100) : 100;

  return Ok({
    totalLinks: agentsTotalLinks,
    brokenLinks,
    validLinks,
    integrity,
  });
}
