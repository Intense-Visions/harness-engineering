import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { TemplateEngine } from '../../src/templates/engine';

let root: string;
let tplDir: string;

function tpl(
  name: string,
  meta: Record<string, unknown>,
  files: Record<string, string> = {}
): void {
  const dir = path.join(tplDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'template.json'),
    JSON.stringify({ name, description: `${name} template`, version: 1, ...meta })
  );
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'engine-cov-'));
  tplDir = path.join(root, 'templates');
  mkdirSync(tplDir, { recursive: true });

  // A stray non-directory entry + a dir without template.json + a dir with an
  // invalid template.json — all must be skipped by listTemplates/findTemplateDir.
  writeFileSync(path.join(tplDir, 'loose-file.txt'), 'not a template dir');
  mkdirSync(path.join(tplDir, 'nometa'));
  mkdirSync(path.join(tplDir, 'badmeta'));
  writeFileSync(path.join(tplDir, 'badmeta', 'template.json'), JSON.stringify({ bogus: true }));

  tpl('lvl', { level: 'basic' }, { 'src/index.ts': 'export const a = 1;', '.DS_Store': 'junk' });
  tpl('named', {}, { 'file.txt': 'named body' }); // has a name, no level → named fallback
  tpl('python-base', { language: 'python' }, { 'src/__init__.py': '' });
  tpl(
    'fw',
    { framework: 'fw', language: 'typescript', detect: [{ file: 'marker.txt', contains: 'hi' }] },
    { 'src/app.ts': 'export const app = 1;' }
  );
  tpl('fw-nocontains', {
    framework: 'fw2',
    language: 'typescript',
    detect: [{ file: 'present.txt' }],
  });
  // A framework template with an empty detect array must be skipped by detectFramework.
  tpl('fw-empty-detect', { framework: 'fw3', language: 'typescript', detect: [] });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('listTemplates (cov544)', () => {
  it('skips non-dirs, meta-less dirs, and invalid metadata', () => {
    const engine = new TemplateEngine(tplDir);
    const result = engine.listTemplates();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.value.map((t) => t.name).sort();
    expect(names).toContain('lvl');
    expect(names).not.toContain('badmeta');
  });

  it('returns an Err when the templates dir cannot be read', () => {
    const engine = new TemplateEngine(path.join(root, 'does-not-exist'));
    const result = engine.listTemplates();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Failed to list templates');
  });
});

describe('resolveTemplate (cov544)', () => {
  it('errors when a TS/JS template is requested without a level', () => {
    const engine = new TemplateEngine(tplDir);
    const result = engine.resolveTemplate();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Level is required');
  });

  it('falls back to a named template when no level matches', () => {
    const engine = new TemplateEngine(tplDir);
    const result = engine.resolveTemplate('named');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files.map((f) => f.relativePath)).toContain('file.txt');
  });

  it('errors when neither a level nor a named template matches', () => {
    const engine = new TemplateEngine(tplDir);
    const result = engine.resolveTemplate('ghost');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Template not found for level');
  });

  it('errors when a requested framework overlay does not exist', () => {
    const engine = new TemplateEngine(tplDir);
    const result = engine.resolveTemplate('lvl', 'missing-fw');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Framework template not found');
  });

  it('resolves a level template with a valid framework overlay (overlayMetadata set)', () => {
    const engine = new TemplateEngine(tplDir);
    const result = engine.resolveTemplate('lvl', 'fw');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overlayMetadata?.name).toBe('fw');
    // The .DS_Store planted in lvl/ must be ignored by collectFiles.
    expect(result.value.files.map((f) => f.relativePath)).not.toContain('.DS_Store');
  });

  it('drops the .DS_Store OS file from collected template files', () => {
    const engine = new TemplateEngine(tplDir);
    const result = engine.resolveTemplate('lvl');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files.some((f) => f.relativePath.endsWith('.DS_Store'))).toBe(false);
  });
});

describe('resolveLanguageTemplate path (cov544)', () => {
  it('errors when the language base template is missing', () => {
    const engine = new TemplateEngine(tplDir);
    const result = engine.resolveTemplate(undefined, undefined, 'rust');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Language base template not found');
  });

  it('errors when the framework overlay is missing for a language base', () => {
    const engine = new TemplateEngine(tplDir);
    const result = engine.resolveTemplate(undefined, 'no-fw', 'python');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Framework template not found');
  });

  it('resolves a language base with a framework overlay', () => {
    // fw declares language 'typescript' but findTemplateDir keys on framework, so
    // it still overlays onto the python base here.
    const engine = new TemplateEngine(tplDir);
    const result = engine.resolveTemplate(undefined, 'fw', 'python');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overlayMetadata?.framework).toBe('fw');
  });
});

describe('render error branches (cov544)', () => {
  it('returns Err when a strict Handlebars var is missing', () => {
    tpl('needsvar', {}, { 'greet.txt.hbs': 'Hello {{missingVar}}' });
    const engine = new TemplateEngine(tplDir);
    const resolved = engine.resolveTemplate('needsvar');
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const rendered = engine.render(resolved.value, { projectName: 'p' });
    expect(rendered.ok).toBe(false);
    if (!rendered.ok) expect(rendered.error.message).toContain('Template render failed');
  });

  it('returns Err when a .json.hbs renders to invalid JSON', () => {
    tpl('badjson', {}, { 'data.json.hbs': '{ not: valid json,, }' });
    const engine = new TemplateEngine(tplDir);
    const resolved = engine.resolveTemplate('badjson');
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const rendered = engine.render(resolved.value, { projectName: 'p' });
    expect(rendered.ok).toBe(false);
  });
});

describe('write branches (cov544)', () => {
  it('skips project scaffold files for an existing project, writes harness config files', () => {
    const engine = new TemplateEngine(tplDir);
    const target = path.join(root, 'existing');
    mkdirSync(target, { recursive: true });
    const result = engine.write(
      {
        files: [
          { relativePath: 'src/x.ts', content: 'x' },
          { relativePath: 'AGENTS.md', content: 'a' },
        ],
      },
      target,
      { overwrite: false, existingProject: true }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.written).toContain('AGENTS.md');
    expect(result.value.written).not.toContain('src/x.ts');
  });

  it('records skippedConfigs for a non-JS package config that already exists', () => {
    const engine = new TemplateEngine(tplDir);
    const target = path.join(root, 'py');
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, 'pyproject.toml'), '[tool]\n');
    const result = engine.write(
      { files: [{ relativePath: 'pyproject.toml', content: 'new' }] },
      target,
      { overwrite: false, language: 'python' }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skippedConfigs).toContain('pyproject.toml');
    expect(result.value.written).not.toContain('pyproject.toml');
  });

  it('does not overwrite an existing file when overwrite is false', () => {
    const engine = new TemplateEngine(tplDir);
    const target = path.join(root, 'nowrite');
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, 'keep.txt'), 'original');
    const result = engine.write(
      { files: [{ relativePath: 'keep.txt', content: 'replacement' }] },
      target,
      { overwrite: false }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.written).not.toContain('keep.txt');
  });

  it('overwrites and writes fresh files when overwrite is true', () => {
    const engine = new TemplateEngine(tplDir);
    const target = path.join(root, 'fresh');
    const result = engine.write(
      { files: [{ relativePath: 'a/b.txt', content: 'hello' }] },
      target,
      { overwrite: true }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.written).toContain('a/b.txt');
    expect(existsSync(path.join(target, 'a/b.txt'))).toBe(true);
  });
});

describe('isExistingProject + detectFramework (cov544)', () => {
  it('detects a project by a marker file', () => {
    const engine = new TemplateEngine(tplDir);
    const dir = path.join(root, 'proj');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), '{}');
    expect(engine.isExistingProject(dir)).toBe(true);
    expect(engine.isExistingProject(path.join(root, 'empty-nope'))).toBe(false);
  });

  it('scores a framework whose detect pattern content matches', () => {
    const engine = new TemplateEngine(tplDir);
    const dir = path.join(root, 'app');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'marker.txt'), 'says hi here');
    const result = engine.detectFramework(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.some((c) => c.framework === 'fw')).toBe(true);
  });

  it('scores a framework by mere file presence (no contains)', () => {
    const engine = new TemplateEngine(tplDir);
    const dir = path.join(root, 'app2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'present.txt'), 'anything');
    const result = engine.detectFramework(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.some((c) => c.framework === 'fw2')).toBe(true);
  });

  it('returns no candidates when nothing matches', () => {
    const engine = new TemplateEngine(tplDir);
    const dir = path.join(root, 'bare');
    mkdirSync(dir, { recursive: true });
    const result = engine.detectFramework(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('returns an Err from detectFramework when templates cannot be listed', () => {
    const engine = new TemplateEngine(path.join(root, 'missing-templates'));
    const result = engine.detectFramework(root);
    expect(result.ok).toBe(false);
  });
});
