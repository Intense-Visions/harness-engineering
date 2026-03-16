import * as fs from 'fs';
import * as path from 'path';

export async function getProjectResource(projectRoot: string): Promise<string> {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    return fs.readFileSync(agentsPath, 'utf-8');
  }
  return '# No AGENTS.md found';
}
