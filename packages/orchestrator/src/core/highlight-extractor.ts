import type { Highlight, AttemptStats } from './stream-recorder';

interface ParsedLine {
  type: string;
  timestamp?: string;
  content?: string;
  outcome?: string;
}

const WRITE_EDIT_RE = /^Calling (?:Write|Edit)\(([^)]+)\)/;
const TEST_CMD_RE = /Calling Bash\((?:npx )?(?:vitest|jest|mocha|npm test|pnpm test)/;
const GIT_COMMIT_RE = /Calling Bash\(git commit/;
const GIT_PUSH_RE = /Calling Bash\(git push/;
const COMMIT_MSG_RE = /-m ["']([^"']+)["']/;

/** Classify a single JSONL line into a Highlight, or null if not significant. */
function classifyLine(parsed: ParsedLine): Highlight | null {
  const ts = parsed.timestamp ?? '';
  const content = typeof parsed.content === 'string' ? parsed.content : '';

  if (parsed.type === 'call') {
    return classifyCallEvent(ts, content);
  }

  if (parsed.type === 'status' && content.toLowerCase().includes('fail')) {
    const truncated = content.length > 200 ? content.slice(0, 197) + '...' : content;
    return { timestamp: ts, summary: truncated, category: 'error' };
  }

  if (parsed.type === 'session_end') {
    return {
      timestamp: ts,
      summary: `Agent completed with outcome: ${parsed.outcome ?? 'unknown'}`,
      category: 'completion',
    };
  }

  return null;
}

function classifyCallEvent(ts: string, content: string): Highlight | null {
  const fileMatch = content.match(WRITE_EDIT_RE);
  if (fileMatch?.[1]) {
    return { timestamp: ts, summary: `Modified \`${fileMatch[1]}\``, category: 'file_op' };
  }

  if (TEST_CMD_RE.test(content)) {
    return { timestamp: ts, summary: 'Ran tests', category: 'test' };
  }

  if (GIT_COMMIT_RE.test(content)) {
    const msgMatch = content.match(COMMIT_MSG_RE);
    const summary = msgMatch?.[1] ? `Committed: "${msgMatch[1]}"` : 'Created git commit';
    return { timestamp: ts, summary, category: 'git' };
  }

  if (GIT_PUSH_RE.test(content)) {
    return { timestamp: ts, summary: 'Pushed to remote', category: 'git' };
  }

  return null;
}

/**
 * Scan JSONL content for high-signal events and return the top 5 diverse moments.
 */
export function extractHighlights(jsonlContent: string): Highlight[] {
  if (!jsonlContent.trim()) return [];

  const lines = jsonlContent.trim().split('\n').filter(Boolean);
  const candidates: Highlight[] = [];

  for (const line of lines) {
    let parsed: ParsedLine;
    try {
      // harness-ignore SEC-DES-001: parsing self-written JSONL from disk — trusted internal source
      parsed = JSON.parse(line) as ParsedLine;
    } catch {
      continue;
    }

    const highlight = classifyLine(parsed);
    if (highlight) candidates.push(highlight);
  }

  return selectDiverse(candidates, 5);
}

/**
 * Select up to `limit` highlights with category diversity.
 * At most 2 from any single category. Prefers one from each category present.
 */
function selectDiverse(candidates: Highlight[], limit: number): Highlight[] {
  const byCategory = new Map<string, Highlight[]>();
  for (const c of candidates) {
    const arr = byCategory.get(c.category) ?? [];
    arr.push(c);
    byCategory.set(c.category, arr);
  }

  const result: Highlight[] = [];
  const categoryCounts = new Map<string, number>();

  // First pass: one from each category (prefer latest)
  for (const [cat, items] of byCategory) {
    if (result.length >= limit) break;
    const item = items[items.length - 1];
    if (item) {
      result.push(item);
      categoryCounts.set(cat, 1);
    }
  }

  // Second pass: fill remaining with second picks (max 2 per category)
  for (const [cat, items] of byCategory) {
    if (result.length >= limit) break;
    const count = categoryCounts.get(cat) ?? 0;
    if (count >= 2 || items.length <= 1) continue;
    const pick = items[0]!;
    if (!result.includes(pick)) {
      result.push(pick);
      categoryCounts.set(cat, count + 1);
    }
  }

  result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return result;
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatTime(isoTimestamp: string): string {
  try {
    const d = new Date(isoTimestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return isoTimestamp;
  }
}

/** Escape pipe and backtick characters for GFM table cells. */
function mdEscapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/`/g, '\\`');
}

/**
 * Render a PR comment with execution metrics table and collapsible key moments.
 */
export function renderPRComment(
  stats: AttemptStats,
  highlights: Highlight[],
  orchestratorId: string
): string {
  const toolSummary = mdEscapeCell(stats.toolsCalled.join(', ') || 'none');
  const filesSummary = mdEscapeCell(formatFilesList(stats.filesTouched));

  let md = `**Agent Session Summary** \`${orchestratorId}\`\n\n`;
  md += `| Metric | Value |\n`;
  md += `| --- | --- |\n`;
  md += `| Duration | ${formatDuration(stats.durationMs)} |\n`;
  md += `| Tokens | ${formatNumber(stats.inputTokens)} in / ${formatNumber(stats.outputTokens)} out |\n`;
  md += `| Turns | ${stats.turnCount} |\n`;
  md += `| Tools | ${toolSummary} |\n`;
  md += `| Files | ${filesSummary} |\n`;

  if (highlights.length > 0) {
    md += `\n<details>\n<summary>Key Moments</summary>\n\n`;
    for (const h of highlights) {
      md += `- **${formatTime(h.timestamp)}** — ${h.summary}\n`;
    }
    md += `\n</details>\n`;
  }

  return md;
}

function formatFilesList(files: string[]): string {
  if (files.length === 0) return 'none';
  if (files.length <= 3) return files.join(', ');
  return `${files.slice(0, 3).join(', ')} (+${files.length - 3} more)`;
}
