import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';
import { makeFindingId } from '../constants';
import { scoreRelevance } from '../../state/learnings-content';

export const LEARNINGS_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'learnings',
  tier: 'fast',
  displayName: 'Learnings Researcher',
  focusAreas: [
    'Past learnings — relevant gotchas, decisions, and observations from prior work',
    'Known issues — previously encountered bugs or pitfalls in changed files',
    'Tried approaches — what was attempted before and what failed',
  ],
};

/** Minimum relevance score to surface a learning as a finding. */
const RELEVANCE_THRESHOLD = 0.3;

/**
 * Parse individual learning entries from context file content.
 */
function parseLearningEntries(content: string): string[] {
  return content.split('\n').filter((line) => /^- \*\*\d{4}-\d{2}-\d{2}/.test(line));
}

/** Extract the human-readable summary from a learning entry. */
function extractSummary(entry: string): string {
  const summaryMatch = entry.match(/:\*\*\s*(.+)$/);
  return summaryMatch?.[1] ?? entry.slice(0, 80);
}

/** Check if a learning entry is relevant to a changed file path. */
function isRelevantToFile(entry: string, changedPath: string): boolean {
  const fileName = changedPath.split('/').pop() ?? changedPath;
  if (entry.includes(changedPath) || entry.includes(fileName)) return true;
  const pathSegments = changedPath.split('/').join(' ');
  return scoreRelevance(entry, pathSegments) >= RELEVANCE_THRESHOLD;
}

/** Build a suggestion finding from a matched learning entry. */
function buildFinding(entry: string, changedPath: string): ReviewFinding {
  const summary = extractSummary(entry);
  return {
    id: makeFindingId('learnings', changedPath, 1, summary),
    file: changedPath,
    lineRange: [1, 1],
    domain: 'learnings',
    severity: 'suggestion',
    title: `Past learning relevant: ${summary.slice(0, 60)}`,
    rationale: `A previous learning may be relevant to changes in this file:\n${entry}`,
    evidence: [entry],
    validatedBy: 'heuristic',
  };
}

/**
 * Match a single learning entry against changed files.
 * Returns a finding for the first matching file, or null.
 */
function matchEntryToFiles(entry: string, changedPaths: string[]): ReviewFinding | null {
  const matchedPath = changedPaths.find((p) => isRelevantToFile(entry, p));
  return matchedPath ? buildFinding(entry, matchedPath) : null;
}

/**
 * Run the learnings-researcher review agent.
 *
 * Surfaces relevant past learnings as suggestion-level findings.
 * Examines learnings context files for entries mentioning changed file paths
 * or having high relevance to the changed code.
 */
export function runLearningsAgent(bundle: ContextBundle): ReviewFinding[] {
  const changedPaths = bundle.changedFiles.map((f) => f.path);

  const learningsContextFiles = bundle.contextFiles.filter(
    (f) => f.path === 'learnings-context' || f.path.includes('learnings')
  );

  if (learningsContextFiles.length === 0) return [];

  const allEntries = learningsContextFiles.flatMap((lcf) => parseLearningEntries(lcf.content));

  return allEntries
    .map((entry) => matchEntryToFiles(entry, changedPaths))
    .filter((f): f is ReviewFinding => f !== null);
}
