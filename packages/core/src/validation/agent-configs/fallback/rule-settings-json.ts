import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfigFinding } from '../types';
import { makeFinding, readTextSafe } from './shared';

/** Settings files that must parse as valid JSON. */
const SETTINGS_FILES = [
  '.claude/settings.json',
  '.gemini/settings.json',
  '.codex/settings.json',
  '.mcp.json',
];

/**
 * Run JSON-validity rule:
 *   HARNESS-AC-070 settings-json-valid  (file exists but is not valid JSON)
 */
export function runSettingsJsonRules(cwd: string): AgentConfigFinding[] {
  const findings: AgentConfigFinding[] = [];
  for (const rel of SETTINGS_FILES) {
    const abs = join(cwd, rel);
    if (!existsSync(abs)) continue;
    const content = readTextSafe(abs);
    if (content === null) continue;
    try {
      JSON.parse(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid JSON';
      findings.push(
        makeFinding({
          file: rel,
          ruleId: 'HARNESS-AC-070',
          severity: 'error',
          message: `${rel} is not valid JSON: ${message}`,
          suggestion: 'Run the file through a JSON formatter or check for trailing commas',
        })
      );
    }
  }
  return findings;
}
