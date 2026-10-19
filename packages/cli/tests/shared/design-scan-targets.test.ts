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
    // The module variants joined the list because they are the same two
    // languages the rules already parse, and omitting them silently skipped an
    // adopter's ESM/CJS-suffixed JavaScript. This is also the set `check-deps`
    // discovers, so the two commands agree on what "source" means.
    expect([...DESIGN_SCAN_EXTENSIONS]).toEqual([
      '.ts',
      '.tsx',
      '.mts',
      '.cts',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.css',
      '.scss',
    ]);
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

    const collected = collectDesignScanFiles(dir, undefined, []).files.map((f) =>
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

  // The sibling half of #2070. Closing the omitted-scope door left the
  // explicit-scope door open: every verifier skips a candidate it cannot open,
  // so a scope that resolves to nothing readable produced a zero-finding
  // "clean" report for a run that read no bytes. And drift/brand counted
  // CANDIDATES in `totalFiles`, so they claimed coverage of a file that does
  // not exist.
  describe('a scope that reads nothing is an abstention, not a pass', () => {
    const VERIFIERS = [
      ['audit-anatomy', runAudit],
      ['detect-design-drift', runDetectDrift],
      ['audit-brand-compliance', runAuditBrand],
    ] as const;

    const SOURCE = `export const List = ({ items }) => <ul>{items.map((i) => <li>{i}</li>)}</ul>;\n`;

    it.each(VERIFIERS)('%s rejects a glob scope rather than reporting clean', async (_n, run) => {
      dir = project({ 'src/List.tsx': SOURCE });
      // `-f, --files` was documented as "file/glob" but no verifier has ever
      // expanded a glob, so every glob is an unreadable path.
      await expect(run({ path: dir, mode: 'full', files: ['src/**/*.tsx'] })).rejects.toThrow(
        /read no files/i
      );
    });

    it.each(VERIFIERS)('%s rejects a typo scope rather than reporting clean', async (_n, run) => {
      dir = project({ 'src/List.tsx': SOURCE });
      await expect(run({ path: dir, mode: 'full', files: ['src/Lst.tsx'] })).rejects.toThrow(
        /read no files/i
      );
    });

    it.each(VERIFIERS)('%s treats no design surface as not applicable', async (_n, run) => {
      dir = project({ 'README.md': '# docs only\n' });
      // No candidates existed at all, so zero findings is a true statement, not
      // an abstention. `harness init` + `harness validate` is this case.
      const out = await run({ path: dir, mode: 'full' });
      expect(out.summary.totalFiles).toBe(0);
      expect(out.findings).toEqual([]);
    });

    // The "not applicable" branch must key off a fact about the PROJECT, not
    // about this verifier's six-extension allowlist. Keying it off the
    // allowlist made an adopter whose components are .vue/.svelte — or whose
    // only JS is .mjs/.cjs — get totalFiles=0, findings=0, exit 0: bit for bit
    // the #2070 report this module exists to prevent.
    it.each(VERIFIERS)('%s abstains on a dialect it cannot read', async (_n, run) => {
      // .vue / .svelte are a real design surface in a container format none of
      // these verifiers can parse. (.mjs is NOT an example: it is readable
      // JavaScript, so the fix for it was to scan it, not to abstain.)
      dir = project({
        'src/App.vue': '<template><div/></template>',
        'src/Card.svelte': '<div/>',
      });
      await expect(run({ path: dir, mode: 'full' })).rejects.toThrow(/read no files/i);
    });

    it('separates "no design surface" from "a surface I cannot read"', () => {
      dir = project({ 'README.md': '# docs only\n' });
      expect(collectDesignScanFiles(dir, undefined, []).anyCandidateExisted).toBe(false);

      const other = project({ 'src/App.svelte': '<div/>' });
      try {
        const targets = collectDesignScanFiles(other, undefined, []);
        // Nothing to scan, but there IS a design surface — so this is an
        // abstention, not a clean run.
        expect(targets.files).toEqual([]);
        expect(targets.anyCandidateExisted).toBe(true);
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    });

    it('scans a file deeper than the old 8-level cap', () => {
      // Two files in THIS repository sit at depth 9 and were silently dropped,
      // one of them a .tsx — the reported denominator was quietly short.
      dir = project({ 'a/b/c/d/e/f/g/h/i/List.tsx': SOURCE });
      expect(collectDesignScanFiles(dir, undefined, []).files).toHaveLength(1);
    });

    it.each(VERIFIERS)('%s abstains when the walk is truncated', async (_n, run) => {
      // Past MAX_WALK_DEPTH. A walk that stopped early has not seen the
      // project, so whatever it did read cannot be reported as a complete scan.
      const deep = path.join(...Array.from({ length: 40 }, (_v, i) => `d${i}`));
      dir = project({
        'src/Shallow.tsx': SOURCE,
        [path.join(deep, 'Deep.tsx')]: SOURCE,
      });

      const targets = collectDesignScanFiles(dir, undefined, []);
      expect(targets.walkTruncated).toBe(true);
      expect(targets.files.length).toBeGreaterThan(0); // it read SOMETHING

      await expect(run({ path: dir, mode: 'full' })).rejects.toThrow(/stopped descending/i);
    });

    it.each(VERIFIERS)('%s abstains when the scope discards every candidate', async (_n, run) => {
      dir = project({
        'harness.config.json': JSON.stringify({ design: { exclude: ['**/*'] } }),
        'src/List.tsx': SOURCE,
      });
      await expect(run({ path: dir, mode: 'full' })).rejects.toThrow(/read no files/i);
    });

    it.each(VERIFIERS)('%s counts files it READ, not candidates offered', async (_n, run) => {
      dir = project({ 'src/List.tsx': SOURCE });
      const out = await run({
        path: dir,
        mode: 'full',
        files: ['src/List.tsx', 'src/gone.tsx', 'src/also-gone.tsx'],
      });
      // Three candidates, one readable. drift and brand reported 3 here.
      expect(out.summary.totalFiles).toBe(1);
    });
  });
});
