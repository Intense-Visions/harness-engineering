/**
 * Standalone `// harness-ignore SEC-XXX-NNN` annotation parser.
 *
 * Kept dependency-free (no rule registry, no graph, no config) so it can be
 * reused by the review pipeline's VALIDATE chokepoint (#1302) without dragging
 * in the SecurityScanner's transitive dependencies. `scanner.ts` re-exports
 * `parseHarnessIgnore` so its existing import path stays stable.
 */

export interface SuppressionMatch {
  ruleId: string;
  justification: string | null;
}

// Limitation: only supports line comments (// and #). Block comments (/* */ in
// CSS/HTML) are not recognized as suppressions. This is acceptable because most
// security rules target JS/TS/Go/Python files that use line comments.
export function parseHarnessIgnore(line: string, ruleId: string): SuppressionMatch | null {
  if (!line.includes('harness-ignore')) return null;
  if (!line.includes(ruleId)) return null;

  // Match: // harness-ignore SEC-XXX-NNN: justification text
  // Also: # harness-ignore SEC-XXX-NNN: justification text (for non-JS files)
  const match = line.match(/(?:\/\/|#)\s*harness-ignore\s+(SEC-[A-Z]+-\d+)(?::\s*(.+))?/);
  if (match?.[1] !== ruleId) return null;

  const text = match[2]?.trim();
  return { ruleId, justification: text || null };
}
