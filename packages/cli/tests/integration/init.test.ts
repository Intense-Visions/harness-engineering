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
});
