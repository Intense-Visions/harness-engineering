import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfigFinding } from '../types';
import { makeFinding, readTextSafe, safeFileSize } from './shared';

/** Warn above this size, error above the error threshold. */
export const CLAUDE_MD_WARN_BYTES = 20 * 1024;
export const CLAUDE_MD_ERROR_BYTES = 50 * 1024;

/** Filenames that carry agent context and share the same size/shape expectations. */
const CONTEXT_FILES = ['CLAUDE.md', 'AGENTS.md'];

/**
 * Run CLAUDE.md / AGENTS.md shape rules:
 *   HARNESS-AC-001 context-file-size   (warn >20KB, error >50KB)
 *   HARNESS-AC-002 context-file-empty  (blank file)
 *   HARNESS-AC-003 context-file-h1     (missing top-level heading)
 */
export function runClaudeMdRules(cwd: string): AgentConfigFinding[] {
  const findings: AgentConfigFinding[] = [];
  for (const name of CONTEXT_FILES) {
    const abs = join(cwd, name);
    if (!existsSync(abs)) continue;
    findings.push(...inspectContextFile(abs, name));
  }
  return findings;
}

function inspectContextFile(abs: string, name: string): AgentConfigFinding[] {
  const out: AgentConfigFinding[] = [];
  const sizeFinding = checkContextFileSize(abs, name);
  if (sizeFinding) out.push(sizeFinding);

  const content = readTextSafe(abs);
  if (content === null) return out;

  if (content.trim() === '') {
    out.push(
      makeFinding({
        file: name,
        ruleId: 'HARNESS-AC-002',
        severity: 'error',
        message: `${name} is empty — agents receive no project context`,
        suggestion: `Add a top-level '# ${name.replace('.md', '')}' heading and project overview`,
      })
    );
    return out;
  }

  const firstNonEmpty = content.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  if (!firstNonEmpty.trim().startsWith('# ')) {
    out.push(
      makeFinding({
        file: name,
        ruleId: 'HARNESS-AC-003',
        severity: 'warning',
        message: `${name} does not start with a level-1 heading`,
        suggestion: `Begin the file with '# Project Name' for clear agent context`,
        line: 1,
      })
    );
  }
  return out;
}

function checkContextFileSize(abs: string, name: string): AgentConfigFinding | null {
  const size = safeFileSize(abs);
  if (size === null) return null;
  if (size >= CLAUDE_MD_ERROR_BYTES) {
    return makeFinding({
      file: name,
      ruleId: 'HARNESS-AC-001',
      severity: 'error',
      message: `${name} is ${Math.round(size / 1024)}KB — agents degrade past ~50KB of context`,
      suggestion: 'Split guidance into referenced docs under docs/ or agents/',
    });
  }
  if (size >= CLAUDE_MD_WARN_BYTES) {
    return makeFinding({
      file: name,
      ruleId: 'HARNESS-AC-001',
      severity: 'warning',
      message: `${name} is ${Math.round(size / 1024)}KB — consider trimming below 20KB`,
      suggestion: 'Move detailed guidance into linked docs',
    });
  }
  return null;
}
