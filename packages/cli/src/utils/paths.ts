import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Walk up from the current file to find a directory by name.
 * Uses a marker file/dir to distinguish from same-named code directories.
 * Works for both src (vitest) and dist (compiled) contexts.
 */
function findUpDir(targetName: string, marker: string, maxLevels = 8): string | null {
  let dir = __dirname;
  for (let i = 0; i < maxLevels; i++) {
    const candidate = path.join(dir, targetName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      // Verify with marker to avoid matching code directories (e.g., src/templates/)
      if (fs.existsSync(path.join(candidate, marker))) {
        return candidate;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

export function resolveTemplatesDir(): string {
  // Look for templates/ dir containing base/template.json (not src/templates/ which has code)
  // Walk up first (works in monorepo dev), then fall back to bundled templates in dist/
  return findUpDir('templates', 'base') ?? path.join(__dirname, 'templates');
}

export function resolvePersonasDir(): string {
  // Look for agents/ dir containing personas/ subdirectory
  const agentsDir = findUpDir('agents', 'personas');
  if (agentsDir) {
    return path.join(agentsDir, 'personas');
  }
  return path.join(__dirname, '..', '..', 'agents', 'personas');
}

export function resolveSkillsDir(): string {
  // Find agents/ dir containing skills/ subdirectory, then navigate to skills/claude-code/
  const agentsDir = findUpDir('agents', 'skills');
  if (agentsDir) {
    return path.join(agentsDir, 'skills', 'claude-code');
  }
  return path.join(__dirname, '..', '..', 'agents', 'skills', 'claude-code');
}
