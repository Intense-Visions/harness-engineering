import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findUpDir(targetName: string, marker: string, maxLevels = 8): string | null {
  let dir = __dirname;
  for (let i = 0; i < maxLevels; i++) {
    const candidate = path.join(dir, targetName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      if (fs.existsSync(path.join(candidate, marker))) {
        return candidate;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

export function resolveTemplatesDir(): string {
  return findUpDir('templates', 'base') ?? path.resolve(__dirname, '..', '..', '..', '..', 'templates');
}

export function resolvePersonasDir(): string {
  const agentsDir = findUpDir('agents', 'personas');
  if (agentsDir) return path.join(agentsDir, 'personas');
  return path.resolve(__dirname, '..', '..', '..', '..', 'agents', 'personas');
}

export function resolveSkillsDir(): string {
  const agentsDir = findUpDir('agents', 'skills');
  if (agentsDir) return path.join(agentsDir, 'skills', 'claude-code');
  return path.resolve(__dirname, '..', '..', '..', '..', 'agents', 'skills', 'claude-code');
}
