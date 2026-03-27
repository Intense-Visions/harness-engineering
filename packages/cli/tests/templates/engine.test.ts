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
});
