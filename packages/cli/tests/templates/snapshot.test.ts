import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { TemplateEngine } from '../../src/templates/engine';

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
// Pinned so the scaffolded `@harness-engineering/cli` range does not churn the
// snapshots on every release (the engine defaults it to the running CLI_VERSION).
const SNAPSHOT_CLI_VERSION = '1.2.3';
// Same for the scaffolded `@harness-engineering/eslint-plugin` range.
const SNAPSHOT_ESLINT_PLUGIN_VERSION = '4.5.6';

describe('template snapshots', () => {
  const engine = new TemplateEngine(TEMPLATES_DIR);

  for (const level of ['basic', 'intermediate', 'load-bearing-minimum', 'advanced'] as const) {
    it(`${level} template output matches snapshot`, () => {
      const resolved = engine.resolveTemplate(level);
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = engine.render(resolved.value, {
        projectName: 'snapshot-test',
        harnessCliVersion: SNAPSHOT_CLI_VERSION,
        eslintPluginVersion: SNAPSHOT_ESLINT_PLUGIN_VERSION,
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
        harnessCliVersion: SNAPSHOT_CLI_VERSION,
        eslintPluginVersion: SNAPSHOT_ESLINT_PLUGIN_VERSION,
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
        harnessCliVersion: SNAPSHOT_CLI_VERSION,
        eslintPluginVersion: SNAPSHOT_ESLINT_PLUGIN_VERSION,
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

  const nonJsOverlays = [
    { framework: 'fastapi', language: 'python' as const, expectedFile: 'src/main.py' },
    { framework: 'django', language: 'python' as const, expectedFile: 'manage.py' },
    { framework: 'gin', language: 'go' as const, expectedFile: 'main.go' },
    { framework: 'axum', language: 'rust' as const, expectedFile: 'src/main.rs' },
    {
      framework: 'spring-boot',
      language: 'java' as const,
      expectedFile: 'src/main/java/Application.java',
    },
  ] as const;

  for (const { framework, language, expectedFile } of nonJsOverlays) {
    it(`${framework} overlay with ${language}-base matches snapshot`, () => {
      const resolved = engine.resolveTemplate(undefined, framework, language);
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = engine.render(resolved.value, {
        projectName: 'snapshot-test',
        harnessCliVersion: SNAPSHOT_CLI_VERSION,
        eslintPluginVersion: SNAPSHOT_ESLINT_PLUGIN_VERSION,
        language,
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
