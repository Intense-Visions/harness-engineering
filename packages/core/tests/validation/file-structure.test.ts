import { describe, it, expect } from 'vitest';
import { validateFileStructure } from '../../src/validation/file-structure';
import { isOk } from '../../src/shared/result';
import { join } from 'path';

describe('validateFileStructure', () => {
  it('should validate required files exist', async () => {
    const projectPath = join(__dirname, '../fixtures/valid-project');
    const conventions = [
      {
        pattern: 'README.md',
        required: true,
        description: 'Project README',
        examples: ['README.md'],
      },
      {
        pattern: 'AGENTS.md',
        required: true,
        description: 'Agents documentation',
        examples: ['AGENTS.md'],
      },
    ];

    const result = await validateFileStructure(projectPath, conventions);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.missing).toHaveLength(0);
      expect(result.value.conformance).toBe(100);
    }
  });

  it('should detect missing required files', async () => {
    const projectPath = join(__dirname, '../fixtures/invalid-project');
    const conventions = [
      {
        pattern: 'README.md',
        required: true,
        description: 'Project README',
        examples: ['README.md'],
      },
      {
        pattern: 'AGENTS.md',
        required: true,
        description: 'Agents documentation',
        examples: ['AGENTS.md'],
      },
    ];

    const result = await validateFileStructure(projectPath, conventions);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.missing).toHaveLength(1);
      expect(result.value.missing[0]).toBe('AGENTS.md');
      expect(result.value.conformance).toBe(50);
    }
  });

  it('should pass validation when optional files are missing', async () => {
    const projectPath = join(__dirname, '../fixtures/invalid-project');
    const conventions = [
      {
        pattern: 'README.md',
        required: true,
        description: 'Project README',
        examples: ['README.md'],
      },
      {
        pattern: 'CHANGELOG.md',
        required: false,
        description: 'Changelog (optional)',
        examples: ['CHANGELOG.md'],
      },
    ];

    const result = await validateFileStructure(projectPath, conventions);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.missing).toHaveLength(0);
      expect(result.value.conformance).toBe(100);
    }
  });

  it('should support glob patterns for matching files', async () => {
    const projectPath = join(__dirname, '../fixtures/valid-project');
    const conventions = [
      {
        pattern: '*.md',
        required: true,
        description: 'Root markdown files',
        examples: ['README.md', 'AGENTS.md'],
      },
      {
        pattern: 'docs/**/*.md',
        required: true,
        description: 'Documentation files',
        examples: ['docs/api.md', 'docs/guide.md'],
      },
    ];

    const result = await validateFileStructure(projectPath, conventions);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.missing).toHaveLength(0);
      expect(result.value.conformance).toBe(100);
    }
  });

  it('should calculate conformance correctly with no required files', async () => {
    const projectPath = join(__dirname, '../fixtures/valid-project');
    const conventions = [
      {
        pattern: 'optional.txt',
        required: false,
        description: 'Optional file',
        examples: ['optional.txt'],
      },
    ];

    const result = await validateFileStructure(projectPath, conventions);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.conformance).toBe(100);
    }
  });

  it('should handle multiple missing required files', async () => {
    const projectPath = join(__dirname, '../fixtures/invalid-project');
    const conventions = [
      {
        pattern: 'README.md',
        required: true,
        description: 'Project README',
        examples: ['README.md'],
      },
      {
        pattern: 'AGENTS.md',
        required: true,
        description: 'Agents documentation',
        examples: ['AGENTS.md'],
      },
      {
        pattern: 'CONTRIBUTING.md',
        required: true,
        description: 'Contributing guide',
        examples: ['CONTRIBUTING.md'],
      },
    ];

    const result = await validateFileStructure(projectPath, conventions);

    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.missing.length).toBeGreaterThan(1);
      expect(result.value.conformance).toBeLessThan(100);
    }
  });
});
