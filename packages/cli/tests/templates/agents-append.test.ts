import { describe, it, expect } from 'vitest';
import { appendFrameworkSection, buildFrameworkSection } from '../../src/templates/agents-append';

describe('appendFrameworkSection', () => {
  it('appends framework section to existing AGENTS.md content', () => {
    const existing = '# My Project\n\nSome content.\n';
    const result = appendFrameworkSection(existing, 'fastapi', 'python');
    expect(result).toContain('# My Project');
    expect(result).toContain('<!-- harness:framework-conventions:fastapi -->');
    expect(result).toContain('## FastAPI Conventions');
    expect(result).toContain('<!-- /harness:framework-conventions:fastapi -->');
  });

  it('does not duplicate section if marker already exists', () => {
    const existing =
      '# My Project\n\n<!-- harness:framework-conventions:fastapi -->\n## FastAPI Conventions\nstuff\n<!-- /harness:framework-conventions:fastapi -->\n';
    const result = appendFrameworkSection(existing, 'fastapi', 'python');
    expect(result).toBe(existing);
  });

  it('appends different framework section even if another exists', () => {
    const existing =
      '# My Project\n\n<!-- harness:framework-conventions:fastapi -->\n## FastAPI Conventions\nstuff\n<!-- /harness:framework-conventions:fastapi -->\n';
    const result = appendFrameworkSection(existing, 'django', 'python');
    expect(result).toContain('<!-- harness:framework-conventions:django -->');
    expect(result).toContain('## Django Conventions');
  });

  it('returns original content when no framework specified', () => {
    const existing = '# My Project\n';
    const result = appendFrameworkSection(existing, undefined, 'python');
    expect(result).toBe(existing);
  });
});

describe('buildFrameworkSection', () => {
  it('builds section for each supported framework', () => {
    const frameworks = [
      'nextjs',
      'react-vite',
      'vue',
      'express',
      'nestjs',
      'fastapi',
      'django',
      'gin',
      'axum',
      'spring-boot',
    ];
    for (const fw of frameworks) {
      const section = buildFrameworkSection(fw);
      expect(section.length).toBeGreaterThan(50);
      expect(section).toContain(fw);
    }
  });

  it('returns empty string for unknown framework', () => {
    const section = buildFrameworkSection('unknown-fw');
    expect(section).toBe('');
  });
});
