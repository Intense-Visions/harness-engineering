import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { TemplateEngine } from '../../src/templates/engine';

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');

describe('template snapshots', () => {
  const engine = new TemplateEngine(TEMPLATES_DIR);

  for (const level of ['basic', 'intermediate', 'advanced'] as const) {
    it(`${level} template output matches snapshot`, () => {
      const resolved = engine.resolveTemplate(level);
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = engine.render(resolved.value, {
        projectName: 'snapshot-test',
        level,
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const fileMap = Object.fromEntries(
        rendered.value.files.map((f) => [f.relativePath, f.content])
      );
      expect(fileMap).toMatchSnapshot();
    });
  }

  const languageBases = [
    { language: 'python', expectedFile: 'pyproject.toml' },
    { language: 'go', expectedFile: 'go.mod' },
    { language: 'rust', expectedFile: 'Cargo.toml' },
    { language: 'java', expectedFile: 'pom.xml' },
  ] as const;

  for (const { language, expectedFile } of languageBases) {
    it(`${language}-base template output matches snapshot`, () => {
      const resolved = engine.resolveTemplate(undefined, undefined, language);
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = engine.render(resolved.value, {
        projectName: 'snapshot-test',
        language,
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const fileMap = Object.fromEntries(
        rendered.value.files.map((f) => [f.relativePath, f.content])
      );

      // Verify key file exists before snapshot
      expect(fileMap[expectedFile]).toBeDefined();
      expect(fileMap).toMatchSnapshot();
    });
  }

  const frameworkOverlays = [
    { framework: 'react-vite', level: 'basic' as const, expectedFile: 'vite.config.ts' },
    { framework: 'vue', level: 'basic' as const, expectedFile: 'src/App.vue' },
    { framework: 'express', level: 'basic' as const, expectedFile: 'src/app.ts' },
    { framework: 'nestjs', level: 'basic' as const, expectedFile: 'nest-cli.json' },
  ] as const;

  for (const { framework, level, expectedFile } of frameworkOverlays) {
    it(`${framework} overlay with ${level} level matches snapshot`, () => {
      const resolved = engine.resolveTemplate(level, framework);
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = engine.render(resolved.value, {
        projectName: 'snapshot-test',
        level,
        framework,
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const fileMap = Object.fromEntries(
        rendered.value.files.map((f) => [f.relativePath, f.content])
      );

      expect(fileMap[expectedFile]).toBeDefined();
      expect(fileMap).toMatchSnapshot();
    });
  }
});
