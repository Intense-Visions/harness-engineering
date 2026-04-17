import { readFileSync, statSync } from 'node:fs';
import type { AgentConfigFinding, AgentConfigSeverity } from '../types';

/** Relative path helper that is safe to use with `glob` output. */
export function relPath(cwd: string, abs: string): string {
  const normalized = abs.replace(/\\/g, '/');
  const prefix = cwd.replace(/\\/g, '/') + '/';
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

/** Build a finding with uniform shape. */
export function makeFinding(input: {
  file: string;
  ruleId: string;
  severity: AgentConfigSeverity;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}): AgentConfigFinding {
  const finding: AgentConfigFinding = {
    file: input.file,
    ruleId: input.ruleId,
    severity: input.severity,
    message: input.message,
  };
  if (typeof input.line === 'number') finding.line = input.line;
  if (typeof input.column === 'number') finding.column = input.column;
  if (input.suggestion) finding.suggestion = input.suggestion;
  return finding;
}

/** Return text file contents or `null` on read failure. */
export function readTextSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/** Return file size in bytes or `null` if the file does not exist. */
export function safeFileSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

/**
 * Extract a YAML-style frontmatter block (between leading `---` fences) from a markdown document.
 * Returns the raw frontmatter body plus the number of lines consumed so callers can locate errors.
 */
export function extractFrontmatter(content: string): { body: string; lineCount: number } | null {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      return { body: lines.slice(1, i).join('\n'), lineCount: i + 1 };
    }
  }
  return null;
}

/** Parse the key-value pairs of a YAML frontmatter block at a very shallow level. */
export function parseFrontmatterFields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trimStart();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    // Ignore nested block indicators (`>`) and list items — the rule set only needs top-level scalars.
    if (value && !value.startsWith('-')) out[key] = stripQuotes(value);
  }
  return out;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
