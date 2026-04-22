import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runInit } from '../../src/commands/init';

describe('harness init integration', () => {
  const levels = ['basic', 'intermediate', 'advanced'] as const;

  for (const level of levels) {
    it(`scaffolds a valid ${level} project`, async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-init-${level}-`));

      const result = await runInit({ cwd: tmpDir, name: `test-${level}`, level });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // All levels should have these
      expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);

      // Config should have correct template metadata
      const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
      expect(config.template.level).toBe(level);
      expect(config.name).toBe(`test-${level}`);

      // AGENTS.md should contain project name
      const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
      expect(agents).toContain(`test-${level}`);

      fs.rmSync(tmpDir, { recursive: true });
    });
  }

  it('scaffolds basic + nextjs overlay correctly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-nextjs-'));

    const result = await runInit({
      cwd: tmpDir,
      name: 'my-nextjs-app',
      level: 'basic',
      framework: 'nextjs',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should have Next.js files
    expect(fs.existsSync(path.join(tmpDir, 'next.config.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src', 'app', 'page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src', 'app', 'layout.tsx'))).toBe(true);

    // package.json should have merged deps
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.next).toBeDefined();
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.scripts.dev).toBe('next dev');
    // Should also have harness scripts from basic
    expect(pkg.scripts['harness:validate']).toBeDefined();

    fs.rmSync(tmpDir, { recursive: true });
  });

  describe('multi-language framework init (e2e)', () => {
    const jsFrameworks = [
      { framework: 'nextjs', level: 'basic', expectFile: 'next.config.mjs' },
      { framework: 'react-vite', level: 'basic', expectFile: 'vite.config.ts' },
      { framework: 'vue', level: 'basic', expectFile: 'vite.config.ts' },
      { framework: 'express', level: 'basic', expectFile: 'src/app.ts' },
      { framework: 'nestjs', level: 'basic', expectFile: 'nest-cli.json' },
    ];

    for (const { framework, level, expectFile } of jsFrameworks) {
      it(`scaffolds ${framework} with config, AGENTS.md, and framework files`, async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-e2e-${framework}-`));
        const result = await runInit({
          cwd: tmpDir,
          name: `test-${framework}`,
          level,
          framework,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Core files exist
        expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, expectFile))).toBe(true);

        // Config has framework and tooling
        const config = JSON.parse(
          fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8')
        );
        expect(config.template.framework).toBe(framework);
        expect(config.tooling).toBeDefined();
        expect(config.tooling.linter).toBeDefined();

        fs.rmSync(tmpDir, { recursive: true });
      });
    }

    const nonJsFrameworks = [
      {
        framework: 'fastapi',
        language: 'python',
        expectFile: 'src/main.py',
        expectConfig: 'pyproject.toml',
      },
      {
        framework: 'django',
        language: 'python',
        expectFile: 'manage.py',
        expectConfig: 'pyproject.toml',
      },
      { framework: 'gin', language: 'go', expectFile: 'main.go', expectConfig: 'go.mod' },
      {
        framework: 'axum',
        language: 'rust',
        expectFile: 'src/main.rs',
        expectConfig: 'Cargo.toml',
      },
      {
        framework: 'spring-boot',
        language: 'java',
        expectFile: 'src/main/java/App.java',
        expectConfig: 'pom.xml',
      },
    ];

    for (const { framework, language, expectFile, expectConfig } of nonJsFrameworks) {
      it(`scaffolds ${framework} (${language}) with config, AGENTS.md, and framework files`, async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-e2e-${framework}-`));
        const result = await runInit({
          cwd: tmpDir,
          name: `test-${framework}`,
          framework,
          language,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, expectFile))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, expectConfig))).toBe(true);

        const config = JSON.parse(
          fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8')
        );
        expect(config.template.framework).toBe(framework);
        expect(config.template.language).toBe(language);
        expect(config.template.level).toBeUndefined();
        expect(config.tooling).toBeDefined();

        fs.rmSync(tmpDir, { recursive: true });
      });
    }
  });

  describe('bare language scaffold init (e2e)', () => {
    const languages = [
      { language: 'python', expectFile: 'pyproject.toml', expectLinter: 'ruff.toml' },
      { language: 'go', expectFile: 'go.mod', expectLinter: '.golangci.yml' },
      { language: 'rust', expectFile: 'Cargo.toml', expectLinter: 'clippy.toml' },
      { language: 'java', expectFile: 'pom.xml', expectLinter: 'checkstyle.xml' },
      { language: 'typescript', expectFile: 'package.json', expectLinter: undefined },
    ] as const;

    for (const { language, expectFile, expectLinter } of languages) {
      it(`scaffolds bare ${language} project with config and AGENTS.md`, async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-e2e-${language}-`));
        const opts: Record<string, unknown> = { cwd: tmpDir, name: `test-${language}` };
        if (language === 'typescript') {
          opts.level = 'basic';
        } else {
          opts.language = language;
        }

        const result = await runInit(opts as Parameters<typeof runInit>[0]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, expectFile))).toBe(true);
        if (expectLinter) {
          expect(fs.existsSync(path.join(tmpDir, expectLinter))).toBe(true);
        }

        const config = JSON.parse(
          fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8')
        );
        if (language !== 'typescript') {
          expect(config.template.language).toBe(language);
          expect(config.template.level).toBeUndefined();
          expect(config.tooling).toBeDefined();
        }

        fs.rmSync(tmpDir, { recursive: true });
      });
    }
  });

  describe('existing project overlay (e2e)', () => {
    it('does not clobber existing files when overlaying fastapi on existing Python project', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-e2e-existing-'));
      fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "my-existing"\n');
      fs.writeFileSync(
        path.join(tmpDir, 'AGENTS.md'),
        '# My Existing Project\n\nExisting content.\n'
      );

      const result = await runInit({
        cwd: tmpDir,
        name: 'my-existing',
        framework: 'fastapi',
        language: 'python',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Existing pyproject.toml preserved (skipped)
      const pyproject = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf-8');
      expect(pyproject).toContain('my-existing');

      // AGENTS.md has framework section appended
      const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
      expect(agents).toContain('My Existing Project');
      expect(agents).toContain('## FastAPI Conventions');

      // harness.config.json written
      expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('does not scaffold Maven files into existing Gradle project (#235)', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-e2e-gradle-'));
      // Simulate existing Gradle-based Java project
      fs.writeFileSync(
        path.join(tmpDir, 'build.gradle'),
        'plugins { id "java" }\ngroup = "com.example"\n'
      );
      fs.mkdirSync(path.join(tmpDir, 'src', 'main', 'java', 'com', 'example'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(tmpDir, 'src', 'main', 'java', 'com', 'example', 'Main.java'),
        'package com.example;\npublic class Main {}\n'
      );

      const result = await runInit({
        cwd: tmpDir,
        name: 'my-gradle-project',
        language: 'java',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // harness.config.json SHOULD be created
      expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);

      // pom.xml SHOULD NOT be created — project already has build.gradle
      expect(fs.existsSync(path.join(tmpDir, 'pom.xml'))).toBe(false);

      // Scaffold source files SHOULD NOT be created — project already has source code
      expect(fs.existsSync(path.join(tmpDir, 'src', 'main', 'java', 'App.java'))).toBe(false);

      // Existing files SHOULD be preserved
      const buildGradle = fs.readFileSync(path.join(tmpDir, 'build.gradle'), 'utf-8');
      expect(buildGradle).toContain('com.example');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('does not scaffold source files into existing Go project with go.mod', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-e2e-existing-go-'));
      fs.writeFileSync(
        path.join(tmpDir, 'go.mod'),
        'module github.com/example/myproject\n\ngo 1.21\n'
      );
      fs.writeFileSync(path.join(tmpDir, 'main.go'), 'package main\nfunc main() {}\n');

      const result = await runInit({
        cwd: tmpDir,
        name: 'my-go-project',
        language: 'go',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // harness.config.json SHOULD be created
      expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);

      // Existing go.mod SHOULD be preserved (not overwritten)
      const goMod = fs.readFileSync(path.join(tmpDir, 'go.mod'), 'utf-8');
      expect(goMod).toContain('github.com/example/myproject');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('scaffolds everything into a brand new empty directory', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-e2e-new-java-'));

      const result = await runInit({
        cwd: tmpDir,
        name: 'new-java-project',
        language: 'java',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Brand new project — ALL template files should be created
      expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'pom.xml'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src', 'main', 'java', 'App.java'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'checkstyle.xml'))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true });
    });
  });
});
