import { glob } from 'glob';
import { existsSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import type { AgentConfigFinding } from '../types';
import { makeFinding, readTextSafe, relPath } from './shared';

/**
 * Run slash-command / command-reference rules:
 *   HARNESS-AC-060 command-file-exists  (referenced slash command file is missing)
 *
 * Slash command markdown files can reference other files via `invoke:` frontmatter keys or
 * inline markdown links of the form `[label](path.md)`. If a relative link points at a file
 * that does not exist, the command will silently fail at runtime.
 */
export async function runCommandRules(cwd: string): Promise<AgentConfigFinding[]> {
  const findings: AgentConfigFinding[] = [];
  const commandFiles = await glob('agents/commands/**/*.md', { cwd, absolute: true });
  for (const abs of commandFiles) findings.push(...inspectCommandFile(cwd, abs));
  return findings;
}

function inspectCommandFile(cwd: string, abs: string): AgentConfigFinding[] {
  const rel = relPath(cwd, abs);
  const content = readTextSafe(abs);
  if (content === null) return [];
  const dir = dirname(abs);
  const out: AgentConfigFinding[] = [];
  for (const target of extractLinkTargets(content)) {
    const absTarget = isAbsolute(target) ? target : resolve(dir, target);
    if (!existsSync(absTarget)) {
      out.push(
        makeFinding({
          file: rel,
          ruleId: 'HARNESS-AC-060',
          severity: 'warning',
          message: `Command references missing file '${target}'`,
          suggestion: 'Fix the path or remove the broken reference',
        })
      );
    }
  }
  return out;
}

function extractLinkTargets(content: string): string[] {
  const targets: string[] = [];
  const linkPattern = /\[[^\]]+\]\(([^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(content)) !== null) {
    const target = match[1] ?? '';
    if (!target || target.startsWith('http') || target.startsWith('#')) continue;
    const cleaned = target.split('#')[0]!.split('?')[0]!;
    if (cleaned) targets.push(cleaned);
  }
  return targets;
}
