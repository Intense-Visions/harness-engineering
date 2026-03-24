import * as fs from 'fs/promises';
import * as path from 'path';
import { BlueprintData } from './types';

export class ProjectScanner {
  constructor(private rootDir: string) {}

  async scan(): Promise<BlueprintData> {
    let projectName = path.basename(this.rootDir);

    try {
      const pkgPath = path.join(this.rootDir, 'package.json');
      const pkgRaw = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      if (pkg.name) projectName = pkg.name;
    } catch {
      // Fallback to directory name
    }

    return {
      projectName,
      generatedAt: new Date().toISOString(),
      modules: [
        {
          id: 'foundations',
          title: 'Foundations',
          description: 'Utility files and basic types.',
          files: [],
        },
        {
          id: 'core-logic',
          title: 'Core Logic',
          description: 'Mid-level services and domain logic.',
          files: [],
        },
        {
          id: 'interaction-surface',
          title: 'Interaction Surface',
          description: 'APIs, CLIs, and Entry Points.',
          files: [],
        },
        {
          id: 'cross-cutting',
          title: 'Cross-Cutting Concerns',
          description: 'Security, Logging, and Observability.',
          files: [],
        },
      ],
      hotspots: [],
      dependencies: [],
    };
  }
}
