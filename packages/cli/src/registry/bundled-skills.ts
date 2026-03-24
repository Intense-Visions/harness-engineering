import * as fs from 'fs';

/**
 * Read the bundled skills directory and return a Set of skill names.
 * Used to prevent community skills from colliding with bundled skill names.
 */
export function getBundledSkillNames(bundledSkillsDir: string): Set<string> {
  if (!fs.existsSync(bundledSkillsDir)) {
    return new Set();
  }

  const entries = fs.readdirSync(bundledSkillsDir);
  const names = new Set<string>();

  for (const entry of entries) {
    try {
      const stat = fs.statSync(`${bundledSkillsDir}/${entry}`);
      if (stat.isDirectory()) {
        names.add(String(entry));
      }
    } catch {
      // Skip entries we can't stat
    }
  }

  return names;
}
