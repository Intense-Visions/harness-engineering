import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports';
import type { ArchConfig } from '../../../src/architecture/types';

const baseConfig: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

// Planted positives for the configured rules (and their clean twins) live in
// planted-positives.test.ts; this file covers the collector's shape.
describe('ForbiddenImportCollector', () => {
  const collector = new ForbiddenImportCollector();

  it('has category "forbidden-imports"', () => {
    expect(collector.category).toBe('forbidden-imports');
  });

  it('returns a single project-scoped result', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forbidden-imports-'));
    try {
      const results = await collector.collect(baseConfig, root);
      expect(results).toHaveLength(1);
      expect(results[0]!.scope).toBe('project');
      expect(results[0]!.category).toBe('forbidden-imports');
      expect(results[0]!.violations).toHaveLength(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips a file with a syntax error but still scans its siblings', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forbidden-imports-')));
    try {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/broken.ts'), 'export const = ;\n');
      fs.writeFileSync(
        path.join(root, 'src/model.ts'),
        "import { exec } from 'node:child_process';\nexport const m = exec;\n"
      );
      const rules = [{ from: 'src/**', disallow: ['node:child_process'] }];

      const [result] = await collector.collect({ ...baseConfig, forbiddenImports: rules }, root);

      expect(result!.value).toBe(1);
      expect(result!.metadata).toEqual({ rulesConfigured: 1, filesAnalyzed: 1 });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('honors excludePatterns for files a rule would otherwise cover', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'forbidden-imports-')));
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'src/domain/model.ts'),
        "import { exec } from 'node:child_process';\nexport const m = exec;\n"
      );
      const rules = [{ from: 'src/domain/**', disallow: ['node:child_process'] }];

      const [hit] = await collector.collect({ ...baseConfig, forbiddenImports: rules }, root);
      const [excluded] = await collector.collect(
        { ...baseConfig, forbiddenImports: rules, excludePatterns: ['src/domain/**'] },
        root
      );

      expect(hit!.value).toBe(1);
      expect(excluded!.value).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
