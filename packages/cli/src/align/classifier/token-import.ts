/**
 * Token import discovery — scans a source file for an existing token
 * import line in one of three recognized forms:
 *
 *   1. import { tokens } from '<any path>'   (ES named)
 *   2. import tokens from '<any path>'       (ES default)
 *   3. const tokens = require('<any path>')  (CJS)
 *
 * Returns the identifier the file uses to reference the tokens object
 * (always `tokens` in v1 — alias support is v1.x), plus the matched
 * import line for diagnostics. Returns null when no recognized form is
 * present (codemods then downgrade to suggestion).
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Inputs → Token import discovery).
 */

const NAMED_IMPORT = /^\s*import\s*\{\s*tokens(?:\s+as\s+\w+)?\s*\}\s*from\s+['"][^'"]+['"];?\s*$/m;
const DEFAULT_IMPORT = /^\s*import\s+tokens\s+from\s+['"][^'"]+['"];?\s*$/m;
const CJS_REQUIRE = /^\s*const\s+tokens\s*=\s*require\(\s*['"][^'"]+['"]\s*\);?\s*$/m;

export interface TokenImportInfo {
  identifier: string;
  matchedLine: string;
}

export function findTokenImport(source: string): TokenImportInfo | null {
  for (const pattern of [NAMED_IMPORT, DEFAULT_IMPORT, CJS_REQUIRE]) {
    const match = pattern.exec(source);
    if (match !== null) {
      return { identifier: 'tokens', matchedLine: match[0].trim() };
    }
  }
  return null;
}
