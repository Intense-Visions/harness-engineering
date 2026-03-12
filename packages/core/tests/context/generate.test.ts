import { describe, it, expect } from 'vitest';
import { generateAgentsMap } from '../../src/context/generate';
import { join } from 'path';

describe('generateAgentsMap', () => {
  const fixturesDir = join(__dirname, '../fixtures');

  it('should generate basic AGENTS.md structure', async () => {
    const config = {
      rootDir: join(fixturesDir, 'valid-project'),
      includePaths: ['**/*.md', 'docs/**/*'],
      excludePaths: ['node_modules/**'],
    };

    const result = await generateAgentsMap(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('# ');
      expect(result.value).toContain('## Project Overview');
      expect(result.value).toContain('## Repository Structure');
    }
  });

  it('should include custom sections', async () => {
    const config = {
      rootDir: join(fixturesDir, 'valid-project'),
      includePaths: ['**/*.md'],
      excludePaths: [],
      sections: [
        {
          name: 'Documentation',
          pattern: 'docs/**/*.md',
          description: 'Project documentation files',
        },
      ],
    };

    const result = await generateAgentsMap(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('## Documentation');
      expect(result.value).toContain('Project documentation files');
    }
  });

  it('should generate links to discovered files', async () => {
    const config = {
      rootDir: join(fixturesDir, 'valid-project'),
      includePaths: ['**/*.md'],
      excludePaths: [],
    };

    const result = await generateAgentsMap(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should contain markdown links
      expect(result.value).toMatch(/\[.+\]\(.+\)/);
    }
  });
});
