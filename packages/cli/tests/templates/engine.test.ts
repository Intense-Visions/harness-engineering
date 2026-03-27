import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TemplateEngine } from '../../src/templates/engine';

const FIXTURES = path.join(__dirname, 'fixtures', 'mock-templates');

describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine(FIXTURES);
  });

  describe('listTemplates', () => {
    it('lists all templates with metadata', () => {
      const result = engine.listTemplates();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((t) => t.name);
      expect(names).toContain('base');
      expect(names).toContain('basic');
      expect(names).toContain('nextjs');
    });
  });

  describe('resolveTemplate', () => {
    it('resolves a level template with base extension', () => {
      const result = engine.resolveTemplate('basic');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const paths = result.value.files.map((f) => f.relativePath);
      expect(paths).toContain('README.md.hbs');
      expect(paths).toContain('shared.txt');
      expect(paths).toContain('package.json.hbs');
      expect(paths).toContain('src/index.ts');
    });

    it('resolves with framework overlay', () => {
      const result = engine.resolveTemplate('basic', 'nextjs');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const paths = result.value.files.map((f) => f.relativePath);
      expect(paths).toContain('src/app/page.tsx');
      expect(paths).toContain('src/index.ts');
    });

    it('returns error for unknown level', () => {
      const result = engine.resolveTemplate('nonexistent');
      expect(result.ok).toBe(false);
    });
  });

  describe('render', () => {
    it('renders handlebars templates with context', () => {
      const resolveResult = engine.resolveTemplate('basic');
      expect(resolveResult.ok).toBe(true);
      if (!resolveResult.ok) return;

      const renderResult = engine.render(resolveResult.value, {
        projectName: 'my-app',
        level: 'basic',
      });
      expect(renderResult.ok).toBe(true);
      if (!renderResult.ok) return;

      const readme = renderResult.value.files.find((f) => f.relativePath === 'README.md');
      expect(readme).toBeDefined();
      expect(readme!.content).toContain('# my-app');

      const pkg = renderResult.value.files.find((f) => f.relativePath === 'package.json');
      expect(pkg).toBeDefined();
      const parsed = JSON.parse(pkg!.content);
      expect(parsed.name).toBe('my-app');
    });

    it('copies non-hbs files as-is', () => {
      const resolveResult = engine.resolveTemplate('basic');
      if (!resolveResult.ok) return;

      const renderResult = engine.render(resolveResult.value, {
        projectName: 'my-app',
        level: 'basic',
      });
      if (!renderResult.ok) return;

      const shared = renderResult.value.files.find((f) => f.relativePath === 'shared.txt');
      expect(shared).toBeDefined();
      expect(shared!.content).toBe('shared content');
    });

    it('includes file path in render error for missing variables', () => {
      const resolveResult = engine.resolveTemplate('basic');
      expect(resolveResult.ok).toBe(true);
      if (!resolveResult.ok) return;

      // Omit projectName so Handlebars strict mode throws on {{projectName}}
      const renderResult = engine.render(resolveResult.value, {} as any);

      expect(renderResult.ok).toBe(false);
      if (renderResult.ok) return;
      // Error message should include the source template and file path
      expect(renderResult.error.message).toContain('README.md.hbs');
    });

    it('merges package.json from overlay using mergePackageJson', () => {
      const resolveResult = engine.resolveTemplate('basic', 'nextjs');
      if (!resolveResult.ok) return;

      const renderResult = engine.render(resolveResult.value, {
        projectName: 'my-app',
        level: 'basic',
        framework: 'nextjs',
      });
      if (!renderResult.ok) return;

      const pkg = renderResult.value.files.find((f) => f.relativePath === 'package.json');
      expect(pkg).toBeDefined();
      const parsed = JSON.parse(pkg!.content);
      // Overlay deps present
      expect(parsed.dependencies.next).toBe('^14.0.0');
      // Base fields preserved (from basic template)
      expect(parsed.name).toBe('my-app');
      expect(parsed.version).toBe('1.0.0');
    });
  });

  describe('language-aware resolution', () => {
    it('resolves non-JS framework: language-base -> framework overlay', () => {
      const result = engine.resolveTemplate(undefined, 'fastapi', 'python');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const paths = result.value.files.map((f) => f.relativePath);
      // Should include python-base file
      expect(paths).toContain('src/__init__.py');
      // Should include fastapi overlay file
      expect(paths).toContain('src/main.py');
      // Should NOT include JS base files
      expect(paths).not.toContain('shared.txt');
    });

    it('resolves bare language scaffold (language only, no framework)', () => {
      const result = engine.resolveTemplate(undefined, undefined, 'python');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const paths = result.value.files.map((f) => f.relativePath);
      expect(paths).toContain('src/__init__.py');
      // No framework overlay files
      expect(paths).not.toContain('src/main.py');
    });

    it('existing JS/TS resolution is unchanged (level + framework)', () => {
      const result = engine.resolveTemplate('basic', 'nextjs');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const paths = result.value.files.map((f) => f.relativePath);
      expect(paths).toContain('src/app/page.tsx');
      expect(paths).toContain('src/index.ts');
    });

    it('existing JS/TS resolution is unchanged (level only)', () => {
      const result = engine.resolveTemplate('basic');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const paths = result.value.files.map((f) => f.relativePath);
      expect(paths).toContain('shared.txt');
      expect(paths).toContain('package.json.hbs');
    });

    it('returns error for unknown language-base template', () => {
      const result = engine.resolveTemplate(undefined, undefined, 'rust');
      expect(result.ok).toBe(false);
    });
  });

  describe('detectFramework', () => {
    it('detects fastapi from requirements.txt content', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi==0.100.0\nuvicorn\n');

      const result = engine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value[0].framework).toBe('fastapi');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('returns empty array when no frameworks detected', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));

      const result = engine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('scores candidates by number of matching patterns', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi==0.100.0\n');
      fs.writeFileSync(
        path.join(tmpDir, 'pyproject.toml'),
        '[project]\ndependencies = ["fastapi"]\n'
      );

      const result = engine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.length).toBeGreaterThan(0);
      // Two patterns matched = score of 2
      expect(result.value[0].score).toBe(2);

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('write', () => {
    it('writes rendered files to target directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));

      const resolveResult = engine.resolveTemplate('basic');
      if (!resolveResult.ok) return;
      const renderResult = engine.render(resolveResult.value, {
        projectName: 'test-project',
        level: 'basic',
      });
      if (!renderResult.ok) return;

      const writeResult = engine.write(renderResult.value, tmpDir, { overwrite: false });
      expect(writeResult.ok).toBe(true);
      if (!writeResult.ok) return;

      expect(fs.existsSync(path.join(tmpDir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src', 'index.ts'))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('write with existing project skip logic', () => {
    it('skips non-JSON package config files in existing projects', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-write-'));
      // Pre-existing pyproject.toml
      fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "existing"\n');

      const files = {
        files: [
          { relativePath: 'pyproject.toml', content: '[project]\nname = "new"\n' },
          { relativePath: 'src/main.py', content: 'print("hello")' },
        ],
      };

      const result = engine.write(files, tmpDir, { overwrite: false, language: 'python' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // pyproject.toml should be skipped (not in written list)
      expect(result.value.written).not.toContain('pyproject.toml');
      // src/main.py should be written
      expect(result.value.written).toContain('src/main.py');
      // pyproject.toml content should be unchanged
      const content = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf-8');
      expect(content).toContain('existing');
      // skippedConfigs should list pyproject.toml
      expect(result.value.skippedConfigs).toContain('pyproject.toml');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('merges package.json for JS/TS in existing projects (existing behavior)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-write-'));

      const files = {
        files: [
          { relativePath: 'package.json', content: '{"name":"test","version":"1.0.0"}' },
          { relativePath: 'src/index.ts', content: 'console.log("hi")' },
        ],
      };

      const result = engine.write(files, tmpDir, { overwrite: false });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.written).toContain('package.json');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('does not skip non-JSON config files when overwrite is true', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-write-'));
      fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "existing"\n');

      const files = {
        files: [{ relativePath: 'pyproject.toml', content: '[project]\nname = "new"\n' }],
      };

      const result = engine.write(files, tmpDir, { overwrite: true, language: 'python' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.written).toContain('pyproject.toml');

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('language base render (production templates)', () => {
    const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
    let prodEngine: TemplateEngine;

    beforeEach(() => {
      prodEngine = new TemplateEngine(PROD_TEMPLATES);
    });

    it('resolves and renders python-base', () => {
      const resolved = prodEngine.resolveTemplate(undefined, undefined, 'python');
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'my-py-app',
        language: 'python',
      });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;

      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('pyproject.toml');
      expect(paths).toContain('.python-version');
      expect(paths).toContain('ruff.toml');
      expect(paths).toContain('src/__init__.py');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('.gitignore');
      expect(paths).toContain('harness.config.json');

      const pyproject = rendered.value.files.find((f) => f.relativePath === 'pyproject.toml');
      expect(pyproject!.content).toContain('name = "my-py-app"');
      expect(pyproject!.content).toContain('requires-python = ">=3.10"');

      const config = rendered.value.files.find((f) => f.relativePath === 'harness.config.json');
      const parsed = JSON.parse(config!.content);
      expect(parsed.template.language).toBe('python');
      expect(parsed.tooling.linter).toBe('ruff');
    });

    it('resolves and renders go-base', () => {
      const resolved = prodEngine.resolveTemplate(undefined, undefined, 'go');
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'my-go-app',
        language: 'go',
      });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;

      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('go.mod');
      expect(paths).toContain('.golangci.yml');
      expect(paths).toContain('main.go');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('.gitignore');
      expect(paths).toContain('harness.config.json');

      const gomod = rendered.value.files.find((f) => f.relativePath === 'go.mod');
      expect(gomod!.content).toContain('module github.com/example/my-go-app');

      const agents = rendered.value.files.find((f) => f.relativePath === 'AGENTS.md');
      expect(agents!.content).toContain('Go project');
      expect(agents!.content).toContain('golangci-lint');
    });

    it('resolves and renders rust-base', () => {
      const resolved = prodEngine.resolveTemplate(undefined, undefined, 'rust');
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'my-rust-app',
        language: 'rust',
      });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;

      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('Cargo.toml');
      expect(paths).toContain('clippy.toml');
      expect(paths).toContain('src/main.rs');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('.gitignore');
      expect(paths).toContain('harness.config.json');

      const cargo = rendered.value.files.find((f) => f.relativePath === 'Cargo.toml');
      expect(cargo!.content).toContain('name = "my-rust-app"');
      expect(cargo!.content).toContain('edition = "2021"');
    });

    it('resolves and renders java-base', () => {
      const resolved = prodEngine.resolveTemplate(undefined, undefined, 'java');
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'my-java-app',
        language: 'java',
      });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;

      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('pom.xml');
      expect(paths).toContain('checkstyle.xml');
      expect(paths).toContain('src/main/java/App.java');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('.gitignore');
      expect(paths).toContain('harness.config.json');

      const pom = rendered.value.files.find((f) => f.relativePath === 'pom.xml');
      expect(pom!.content).toContain('<artifactId>my-java-app</artifactId>');
      expect(pom!.content).toContain('<groupId>com.example.myjavaapp</groupId>');
    });

    it('renders harness.config.json with valid JSON for all languages', () => {
      for (const lang of ['python', 'go', 'rust', 'java'] as const) {
        const resolved = prodEngine.resolveTemplate(undefined, undefined, lang);
        if (!resolved.ok) throw new Error(resolved.error.message);

        const rendered = prodEngine.render(resolved.value, {
          projectName: `test-${lang}`,
          language: lang,
        });
        if (!rendered.ok) throw new Error(rendered.error.message);

        const config = rendered.value.files.find((f) => f.relativePath === 'harness.config.json');
        expect(config).toBeDefined();
        const parsed = JSON.parse(config!.content);
        expect(parsed.version).toBe(1);
        expect(parsed.template.language).toBe(lang);
        expect(parsed.tooling).toBeDefined();
      }
    });

    it('writes python-base to disk and produces expected files', () => {
      const resolved = prodEngine.resolveTemplate(undefined, undefined, 'python');
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'disk-test',
        language: 'python',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-py-'));
      const writeResult = prodEngine.write(rendered.value, tmpDir, {
        overwrite: false,
        language: 'python',
      });
      expect(writeResult.ok).toBe(true);
      if (!writeResult.ok) return;

      expect(fs.existsSync(path.join(tmpDir, 'pyproject.toml'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.python-version'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'ruff.toml'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src', '__init__.py'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('skips pyproject.toml in existing Python project without --force', () => {
      const resolved = prodEngine.resolveTemplate(undefined, undefined, 'python');
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'existing-py',
        language: 'python',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-py-existing-'));
      fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "existing"\n');

      const writeResult = prodEngine.write(rendered.value, tmpDir, {
        overwrite: false,
        language: 'python',
      });
      expect(writeResult.ok).toBe(true);
      if (!writeResult.ok) return;

      expect(writeResult.value.skippedConfigs).toContain('pyproject.toml');
      const content = fs.readFileSync(path.join(tmpDir, 'pyproject.toml'), 'utf-8');
      expect(content).toContain('existing');
      // Other files should still be written
      expect(writeResult.value.written).toContain('AGENTS.md');

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('JS/TS framework overlay resolution (production templates)', () => {
    const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
    let prodEngine: TemplateEngine;

    beforeEach(() => {
      prodEngine = new TemplateEngine(PROD_TEMPLATES);
    });

    const frameworks = ['react-vite', 'vue', 'express', 'nestjs'] as const;
    const levels = ['basic', 'intermediate', 'advanced'] as const;

    for (const fw of frameworks) {
      it(`resolves ${fw} overlay with basic level`, () => {
        const result = prodEngine.resolveTemplate('basic', fw);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const paths = result.value.files.map((f) => f.relativePath);
        // Should include overlay package.json.hbs
        expect(
          paths.some((p) => p === 'package.json.hbs' || p === '__overlay__package.json.hbs')
        ).toBe(true);
      });

      for (const level of levels) {
        it(`renders ${fw} with ${level} level without errors`, () => {
          const resolved = prodEngine.resolveTemplate(level, fw);
          expect(resolved.ok).toBe(true);
          if (!resolved.ok) return;

          const rendered = prodEngine.render(resolved.value, {
            projectName: 'test-app',
            level,
            framework: fw,
          });
          expect(rendered.ok).toBe(true);
          if (!rendered.ok) return;

          // Should produce a merged package.json
          const pkg = rendered.value.files.find((f) => f.relativePath === 'package.json');
          expect(pkg).toBeDefined();
          const parsed = JSON.parse(pkg!.content);
          expect(parsed.name).toBe('test-app');
        });
      }
    }

    it('react-vite overlay includes expected files', () => {
      const resolved = prodEngine.resolveTemplate('basic', 'react-vite');
      if (!resolved.ok) throw new Error(resolved.error.message);
      const rendered = prodEngine.render(resolved.value, {
        projectName: 'test-app',
        level: 'basic',
        framework: 'react-vite',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);
      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('vite.config.ts');
      expect(paths).toContain('index.html');
      expect(paths).toContain('src/App.tsx');
      expect(paths).toContain('src/main.tsx');
    });

    it('vue overlay includes expected files', () => {
      const resolved = prodEngine.resolveTemplate('basic', 'vue');
      if (!resolved.ok) throw new Error(resolved.error.message);
      const rendered = prodEngine.render(resolved.value, {
        projectName: 'test-app',
        level: 'basic',
        framework: 'vue',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);
      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('vite.config.ts');
      expect(paths).toContain('index.html');
      expect(paths).toContain('src/App.vue');
      expect(paths).toContain('src/main.ts');
    });

    it('express overlay includes expected files', () => {
      const resolved = prodEngine.resolveTemplate('basic', 'express');
      if (!resolved.ok) throw new Error(resolved.error.message);
      const rendered = prodEngine.render(resolved.value, {
        projectName: 'test-app',
        level: 'basic',
        framework: 'express',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);
      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('src/app.ts');
    });

    it('nestjs overlay includes expected files', () => {
      const resolved = prodEngine.resolveTemplate('basic', 'nestjs');
      if (!resolved.ok) throw new Error(resolved.error.message);
      const rendered = prodEngine.render(resolved.value, {
        projectName: 'test-app',
        level: 'basic',
        framework: 'nestjs',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);
      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('nest-cli.json');
      expect(paths).toContain('src/app.module.ts');
      expect(paths).toContain('src/main.ts');
    });

    it('nestjs package.json merges overlay deps into base', () => {
      const resolved = prodEngine.resolveTemplate('basic', 'nestjs');
      if (!resolved.ok) throw new Error(resolved.error.message);
      const rendered = prodEngine.render(resolved.value, {
        projectName: 'test-app',
        level: 'basic',
        framework: 'nestjs',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);
      const pkg = rendered.value.files.find((f) => f.relativePath === 'package.json');
      const parsed = JSON.parse(pkg!.content);
      expect(parsed.dependencies['@nestjs/core']).toBe('^10.0.0');
      expect(parsed.dependencies['@nestjs/common']).toBe('^10.0.0');
      expect(parsed.dependencies['@nestjs/platform-express']).toBe('^10.0.0');
    });
  });

  describe('JS/TS framework auto-detection (production templates)', () => {
    const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
    let prodEngine: TemplateEngine;

    beforeEach(() => {
      prodEngine = new TemplateEngine(PROD_TEMPLATES);
    });

    it('detects react-vite from vite.config.ts with plugin-react', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(
        path.join(tmpDir, 'vite.config.ts'),
        'import react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });'
      );

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('react-vite');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('detects vue from package.json with vue dependency', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { vue: '^3.0.0' } })
      );

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('vue');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('detects express from package.json with express dependency', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { express: '^4.0.0' } })
      );

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('express');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('detects nestjs from package.json with @nestjs/core', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } })
      );

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('nestjs');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('all four JS/TS overlay template.json files have valid language field', () => {
      for (const fw of ['react-vite', 'vue', 'express', 'nestjs']) {
        const templates = prodEngine.listTemplates();
        expect(templates.ok).toBe(true);
        if (!templates.ok) return;
        const meta = templates.value.find((t) => t.framework === fw);
        expect(meta).toBeDefined();
        expect(meta!.language).toBe('typescript');
        expect(meta!.detect).toBeDefined();
        expect(meta!.detect!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Non-JS framework overlay resolution (production templates)', () => {
    const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
    let prodEngine: TemplateEngine;

    beforeEach(() => {
      prodEngine = new TemplateEngine(PROD_TEMPLATES);
    });

    it('resolves and renders fastapi overlay with python-base', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'fastapi', 'python');
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'my-api',
        language: 'python',
        framework: 'fastapi',
      });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;

      const paths = rendered.value.files.map((f) => f.relativePath);
      // FastAPI overlay files
      expect(paths).toContain('src/main.py');
      expect(paths).toContain('requirements.txt');
      // Python-base inherited files
      expect(paths).toContain('pyproject.toml');
      expect(paths).toContain('ruff.toml');
      expect(paths).toContain('.python-version');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('harness.config.json');
      expect(paths).toContain('.gitignore');

      const mainPy = rendered.value.files.find((f) => f.relativePath === 'src/main.py');
      expect(mainPy!.content).toContain('FastAPI');
      expect(mainPy!.content).toContain('@app.get');

      const reqs = rendered.value.files.find((f) => f.relativePath === 'requirements.txt');
      expect(reqs!.content).toContain('fastapi');
      expect(reqs!.content).toContain('uvicorn');
    });

    it('resolves and renders django overlay with python-base', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'django', 'python');
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'my-site',
        language: 'python',
        framework: 'django',
      });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;

      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('manage.py');
      expect(paths).toContain('src/settings.py');
      expect(paths).toContain('src/urls.py');
      expect(paths).toContain('src/wsgi.py');
      expect(paths).toContain('requirements.txt');
      // Python-base inherited
      expect(paths).toContain('pyproject.toml');
      expect(paths).toContain('AGENTS.md');

      const managePy = rendered.value.files.find((f) => f.relativePath === 'manage.py');
      expect(managePy!.content).toContain('my-site');
      expect(managePy!.content).toContain('DJANGO_SETTINGS_MODULE');

      const settings = rendered.value.files.find((f) => f.relativePath === 'src/settings.py');
      expect(settings!.content).toContain('my-site');
    });

    it('resolves and renders gin overlay with go-base', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'gin', 'go');
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'my-server',
        language: 'go',
        framework: 'gin',
      });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;

      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('main.go');
      expect(paths).toContain('go.mod');
      expect(paths).toContain('.golangci.yml');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('harness.config.json');

      const mainGo = rendered.value.files.find((f) => f.relativePath === 'main.go');
      expect(mainGo!.content).toContain('gin-gonic/gin');
      expect(mainGo!.content).toContain('gin.Default');

      const goMod = rendered.value.files.find((f) => f.relativePath === 'go.mod');
      expect(goMod!.content).toContain('gin-gonic/gin');
      expect(goMod!.content).toContain('github.com/example/my-server');
    });

    it('resolves and renders axum overlay with rust-base', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'axum', 'rust');
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'my-service',
        language: 'rust',
        framework: 'axum',
      });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;

      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('src/main.rs');
      expect(paths).toContain('Cargo.toml');
      expect(paths).toContain('clippy.toml');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('harness.config.json');

      const mainRs = rendered.value.files.find((f) => f.relativePath === 'src/main.rs');
      expect(mainRs!.content).toContain('axum');
      expect(mainRs!.content).toContain('Router');
      expect(mainRs!.content).toContain('tokio');

      const cargo = rendered.value.files.find((f) => f.relativePath === 'Cargo.toml');
      expect(cargo!.content).toContain('axum');
      expect(cargo!.content).toContain('tokio');
      expect(cargo!.content).toContain('name = "my-service"');
    });

    it('resolves and renders spring-boot overlay with java-base', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'spring-boot', 'java');
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'my-app',
        language: 'java',
        framework: 'spring-boot',
      });
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;

      const paths = rendered.value.files.map((f) => f.relativePath);
      expect(paths).toContain('src/main/java/Application.java');
      expect(paths).toContain('pom.xml');
      expect(paths).toContain('checkstyle.xml');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('harness.config.json');

      const app = rendered.value.files.find(
        (f) => f.relativePath === 'src/main/java/Application.java'
      );
      expect(app!.content).toContain('@SpringBootApplication');
      expect(app!.content).toContain('SpringApplication.run');

      const pom = rendered.value.files.find((f) => f.relativePath === 'pom.xml');
      expect(pom!.content).toContain('spring-boot-starter-web');
      expect(pom!.content).toContain('spring-boot-starter-parent');
      expect(pom!.content).toContain('<artifactId>my-app</artifactId>');
    });

    it('overlay metadata is set for non-JS frameworks', () => {
      for (const [fw, lang] of [
        ['fastapi', 'python'],
        ['django', 'python'],
        ['gin', 'go'],
        ['axum', 'rust'],
        ['spring-boot', 'java'],
      ] as const) {
        const resolved = prodEngine.resolveTemplate(undefined, fw, lang);
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        expect(resolved.value.overlayMetadata).toBeDefined();
        expect(resolved.value.overlayMetadata!.framework).toBe(fw);
        expect(resolved.value.overlayMetadata!.language).toBe(lang);
      }
    });

    it('all five non-JS overlay template.json files have valid detect patterns', () => {
      const templates = prodEngine.listTemplates();
      expect(templates.ok).toBe(true);
      if (!templates.ok) return;
      for (const fw of ['fastapi', 'django', 'gin', 'axum', 'spring-boot']) {
        const meta = templates.value.find((t) => t.framework === fw);
        expect(meta).toBeDefined();
        expect(meta!.detect).toBeDefined();
        expect(meta!.detect!.length).toBeGreaterThan(0);
        expect(meta!.extends).toBeDefined();
      }
    });
  });

  describe('Non-JS framework auto-detection (production templates)', () => {
    const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
    let prodEngine: TemplateEngine;

    beforeEach(() => {
      prodEngine = new TemplateEngine(PROD_TEMPLATES);
    });

    it('detects fastapi from requirements.txt', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi==0.100.0\nuvicorn\n');

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('fastapi');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('detects django from requirements.txt', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'django>=4.2\n');

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('django');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('detects django from manage.py', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(path.join(tmpDir, 'manage.py'), '#!/usr/bin/env python\nimport django\n');

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('django');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('detects gin from go.mod', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(
        path.join(tmpDir, 'go.mod'),
        'module example.com/app\n\ngo 1.21\n\nrequire github.com/gin-gonic/gin v1.9.1\n'
      );

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('gin');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('detects axum from Cargo.toml', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(
        path.join(tmpDir, 'Cargo.toml'),
        '[package]\nname = "test"\n\n[dependencies]\naxum = "0.7"\ntokio = "1"\n'
      );

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('axum');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('detects spring-boot from pom.xml', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(
        path.join(tmpDir, 'pom.xml'),
        '<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>'
      );

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const names = result.value.map((c) => c.framework);
      expect(names).toContain('spring-boot');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('scores django higher with multiple matching files', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'django>=4.2\n');
      fs.writeFileSync(path.join(tmpDir, 'manage.py'), '#!/usr/bin/env python\nimport django\n');

      const result = prodEngine.detectFramework(tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const django = result.value.find((c) => c.framework === 'django');
      expect(django).toBeDefined();
      expect(django!.score).toBe(2);

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('Non-JS framework write to disk (production templates)', () => {
    const PROD_TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
    let prodEngine: TemplateEngine;

    beforeEach(() => {
      prodEngine = new TemplateEngine(PROD_TEMPLATES);
    });

    it('writes fastapi overlay to new directory', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'fastapi', 'python');
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'test-fastapi',
        language: 'python',
        framework: 'fastapi',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fastapi-'));
      const writeResult = prodEngine.write(rendered.value, tmpDir, {
        overwrite: false,
        language: 'python',
      });
      expect(writeResult.ok).toBe(true);
      if (!writeResult.ok) return;

      expect(fs.existsSync(path.join(tmpDir, 'src', 'main.py'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'requirements.txt'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'pyproject.toml'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('skips requirements.txt in existing fastapi project', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'fastapi', 'python');
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'existing-fastapi',
        language: 'python',
        framework: 'fastapi',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-fastapi-existing-'));
      // Pre-existing requirements.txt
      fs.writeFileSync(
        path.join(tmpDir, 'requirements.txt'),
        'fastapi==0.100.0\nuvicorn\ncustom-dep\n'
      );

      const writeResult = prodEngine.write(rendered.value, tmpDir, {
        overwrite: false,
        language: 'python',
      });
      expect(writeResult.ok).toBe(true);
      if (!writeResult.ok) return;

      // requirements.txt should NOT be overwritten
      const content = fs.readFileSync(path.join(tmpDir, 'requirements.txt'), 'utf-8');
      expect(content).toContain('custom-dep');
      // But other files should be written
      expect(writeResult.value.written).toContain('src/main.py');
      expect(writeResult.value.written).toContain('AGENTS.md');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('skips go.mod in existing gin project', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'gin', 'go');
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'existing-gin',
        language: 'go',
        framework: 'gin',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-gin-existing-'));
      fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/existing\n\ngo 1.21\n');

      const writeResult = prodEngine.write(rendered.value, tmpDir, {
        overwrite: false,
        language: 'go',
      });
      expect(writeResult.ok).toBe(true);
      if (!writeResult.ok) return;

      expect(writeResult.value.skippedConfigs).toContain('go.mod');
      const content = fs.readFileSync(path.join(tmpDir, 'go.mod'), 'utf-8');
      expect(content).toContain('example.com/existing');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('skips Cargo.toml in existing axum project', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'axum', 'rust');
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'existing-axum',
        language: 'rust',
        framework: 'axum',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-axum-existing-'));
      fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "existing"\n');

      const writeResult = prodEngine.write(rendered.value, tmpDir, {
        overwrite: false,
        language: 'rust',
      });
      expect(writeResult.ok).toBe(true);
      if (!writeResult.ok) return;

      expect(writeResult.value.skippedConfigs).toContain('Cargo.toml');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('skips pom.xml in existing spring-boot project', () => {
      const resolved = prodEngine.resolveTemplate(undefined, 'spring-boot', 'java');
      if (!resolved.ok) throw new Error(resolved.error.message);

      const rendered = prodEngine.render(resolved.value, {
        projectName: 'existing-spring',
        language: 'java',
        framework: 'spring-boot',
      });
      if (!rendered.ok) throw new Error(rendered.error.message);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spring-existing-'));
      fs.writeFileSync(
        path.join(tmpDir, 'pom.xml'),
        '<project><groupId>com.existing</groupId></project>'
      );

      const writeResult = prodEngine.write(rendered.value, tmpDir, {
        overwrite: false,
        language: 'java',
      });
      expect(writeResult.ok).toBe(true);
      if (!writeResult.ok) return;

      expect(writeResult.value.skippedConfigs).toContain('pom.xml');
      const content = fs.readFileSync(path.join(tmpDir, 'pom.xml'), 'utf-8');
      expect(content).toContain('com.existing');

      fs.rmSync(tmpDir, { recursive: true });
    });
  });
});
