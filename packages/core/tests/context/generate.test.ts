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

  it('should truncate file lists when directory has more than 10 files', async () => {
    const config = {
      rootDir: join(fixturesDir, 'large-project'),
      includePaths: ['docs/**/*.md'],
      excludePaths: [],
      sections: [],
    };

    const result = await generateAgentsMap(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should contain truncation message
      expect(result.value).toContain('... and');
      expect(result.value).toContain('more files');
    }
  });

  it('should truncate section file lists when more than 20 files', async () => {
    const config = {
      rootDir: join(fixturesDir, 'large-project'),
      includePaths: ['docs/**/*.md'],
      excludePaths: [],
      sections: [
        {
          name: 'All Docs',
          pattern: 'docs/**/*.md',
          description: 'All documentation files',
        },
      ],
    };

    const result = await generateAgentsMap(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should contain section truncation message
      expect(result.value).toContain('## All Docs');
      expect(result.value).toContain('... and');
    }
  });

  it('should handle errors gracefully', async () => {
    const config = {
      rootDir: '/nonexistent/path/that/does/not/exist',
      includePaths: ['**/*.md'],
      excludePaths: [],
    };

    const result = await generateAgentsMap(config);

    // The function should succeed even with no files found
    // because findFiles returns empty array for non-existent paths
    expect(result.ok).toBe(true);
  });
});
