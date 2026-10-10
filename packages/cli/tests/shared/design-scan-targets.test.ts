/**
 * Pins the shared design scan target set (#2070).
 *
 * The extension list and the walk lived as copy-pasted duplicates in
 * detect-design-drift and audit-brand-compliance, and audit-component-anatomy
 * had no copy at all — it defaulted to `[]` and reported an audit of nothing as
 * clean. These tests pin the one definition and, more importantly, pin the
 * property that motivated the extraction: the three mechanical verifiers
 * `harness check-design` composes must resolve the SAME default file set, so a
 * single run cannot have one verifier quietly looking at less than its siblings.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DESIGN_SCAN_EXTENSIONS,
  collectDesignScanFiles,
  resolveDesignExcludePatterns,
} from '../../src/shared/design-scan-targets';
import { runAudit } from '../../src/mcp/tools/audit-anatomy';
import { runDetectDrift } from '../../src/drift';
import { runAuditBrand } from '../../src/brand';

describe('design scan targets', () => {
  let dir = '';

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  function project(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-scan-'));
    for (const [relative, contents] of Object.entries(files)) {
      const absolute = path.join(root, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, contents);
    }
    return root;
  }

  it('pins the scanned extensions', () => {
    // Adding one here widens every design verifier at once — that is the point.
    expect([...DESIGN_SCAN_EXTENSIONS]).toEqual(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss']);
  });

  it('walks the project, skipping dotfiles and heavy directories', () => {
    dir = project({
      'src/a.tsx': 'export const A = () => null;\n',
      'src/styles.scss': '.a { color: red; }\n',
      'src/notes.md': 'not source\n',
      'node_modules/pkg/b.ts': 'export const B = 1;\n',
      'dist/c.js': 'export const C = 1;\n',
      '.hidden/d.ts': 'export const D = 1;\n',
    });

    const collected = collectDesignScanFiles(dir, undefined, []).map((f) =>
      path.relative(dir, f).replaceAll('\\', '/')
    );

    expect(collected.sort()).toEqual(['src/a.tsx', 'src/styles.scss']);
  });

  it('unions design.exclude with analysis.exclude', () => {
    dir = project({
      'harness.config.json': JSON.stringify({
        design: { exclude: ['vendor/**'] },
        analysis: { exclude: ['generated/**'] },
      }),
    });

    expect(resolveDesignExcludePatterns(dir)).toEqual(['vendor/**', 'generated/**']);
    // An explicit override replaces the design.exclude read, not the project-wide one.
    expect(resolveDesignExcludePatterns(dir, [])).toEqual(['generated/**']);
  });

  it('gives every check-design verifier the same default file set', async () => {
    dir = project({
      'harness.config.json': JSON.stringify({ analysis: { exclude: ['generated/**'] } }),
      'src/List.tsx': `export const List = ({ items }) => <ul>{items.map((i) => <li>{i}</li>)}</ul>;\n`,
      'src/theme.scss': '.a { color: #0066cc; }\n',
      'src/util.ts': 'export const one = 1;\n',
      'generated/List.tsx': `export const Gen = ({ items }) => <ul>{items.map((i) => <li>{i}</li>)}</ul>;\n`,
    });

    const [anatomy, drift, brand] = await Promise.all([
      runAudit({ path: dir, mode: 'full' }),
      runDetectDrift({ path: dir, mode: 'full' }),
      runAuditBrand({ path: dir, mode: 'full' }),
    ]);

    // Three verifiers, one file set. Before the extraction anatomy reported 0.
    expect(anatomy.summary.totalFiles).toBe(3);
    expect(drift.summary.totalFiles).toBe(anatomy.summary.totalFiles);
    expect(brand.summary.totalFiles).toBe(anatomy.summary.totalFiles);
  });
});
