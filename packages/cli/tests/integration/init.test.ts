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
});
