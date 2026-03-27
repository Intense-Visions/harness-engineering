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
});
