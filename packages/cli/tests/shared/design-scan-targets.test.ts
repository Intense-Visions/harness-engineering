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
  isExcluded,
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
    // Gated by RULE APPLICABILITY, not by file exclusion. `token-bypass-rule.ts`
    // is pure regex over raw source with no extension gate, so DRIFT-T001 fires
    // identically on every dialect here — excluding one does not protect anyone
    // from a bad finding, it silently drops a real one, which is #2070. The
    // rules that need a narrower surface gate themselves
    // (`primitive-adoption-rule.ts:54`), and `.css`/`.scss` were always scanned
    // despite primitive-adoption not applying to them — the governing precedent.
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
      '.less',
      '.pcss',
      '.sass',
      '.styl',
      '.vue',
      '.svelte',
      '.astro',
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
    // REVERSED from an earlier revision of this branch, which treated
    // `.vue`/`.svelte`/`.less`/... as unreadable and ABSTAINED on them. That was
    // false: these verifiers read them fine. Measured with a token set loaded,
    // identical content `.x { color: #ff0000; background: #00ff00; }` yields two
    // identical DRIFT-T001 findings for every one of css, scss, tsx, vue,
    // svelte, astro, less, pcss, sass and styl. Declining to scan a dialect does
    // not protect anyone — it silently drops a true finding, which is #2070.
    it('scans single-file-component and preprocessor dialects for real drift', async () => {
      dir = project({
        'design-system/tokens.json': JSON.stringify({
          color: { p: { $value: '#ff0000', $type: 'color' } },
        }),
        'src/App.vue': '<template><b/></template>\n<style>.b { color: #ff0000; }</style>\n',
        'src/C.svelte': '<style>.c { color: #ff0000; }</style>\n',
        'src/P.astro': '<style>.p { color: #ff0000; }</style>\n',
        'src/a.less': '.a { color: #ff0000; }\n',
        'src/b.styl': '.b\n  color: #ff0000\n',
        'src/c.sass': '.c\n  color: #ff0000\n',
        'src/d.pcss': '.d { color: #ff0000; }\n',
      });

      const out = await runDetectDrift({ path: dir, mode: 'full' });

      expect(out.meta.tokensLoaded).toBe(true);
      // Every one of the seven is READ and every one yields a true finding.
      expect(out.summary.totalFiles).toBe(7);
      const files = new Set(out.findings.map((f) => f.file.replace(/^.*[/\\]/, '')));
      expect([...files].sort()).toEqual([
        'App.vue',
        'C.svelte',
        'P.astro',
        'a.less',
        'b.styl',
        'c.sass',
        'd.pcss',
      ]);
    });

    it('under-reports colon-less stylus, which is a limit of the rule not the scope', async () => {
      // Honest boundary, pinned so nobody reads the row above as "stylus is
      // fully covered": the token-bypass regex wants `prop: value`, so stylus'
      // colon-less form is read but not matched. That is a rule limitation to
      // fix in the rule — it is NOT a reason to stop scanning `.styl`, which
      // would turn an under-report into a silent clean pass.
      dir = project({
        'design-system/tokens.json': JSON.stringify({
          color: { p: { $value: '#ff0000', $type: 'color' } },
        }),
        'src/b.styl': '.b\n  color #ff0000\n',
      });

      const out = await runDetectDrift({ path: dir, mode: 'full' });

      expect(out.summary.totalFiles).toBe(1); // read
      expect(out.findings).toEqual([]); // but not matched
    });

    it.each(VERIFIERS)('%s does not abstain on an SFC-only project', async (_n, run) => {
      // The old design exited 2 here with "none of it in a format it can parse".
      // The anatomy conventions and BRAND-V001 under-report on an SFC template
      // (they see `<script>`, not the template) but they do not throw, and
      // under-reporting a component beats refusing to read it and calling the
      // result clean.
      dir = project({ 'src/App.vue': '<template><b/></template>\n' });
      const out = await run({ path: dir, mode: 'full' });
      expect(out.summary.totalFiles).toBe(1);
    });

    it('has no depth cap, so a deep tree is scanned rather than truncated', () => {
      // Was capped at 8, then 32-with-abstention. The cap's stated justification
      // (symlink loops) was false — `readdirSync(withFileTypes)` is lstat-based
      // so `isDirectory()` is false for a dir symlink and the walk never follows
      // one. What the cap actually did was drop files silently, and then
      // hard-fail any repo with a vendored tree deeper than it.
      const deep = path.join(...Array.from({ length: 41 }, (_v, i) => `d${i}`));
      dir = project({ [path.join(deep, 'Deep.tsx')]: SOURCE, 'src/Shallow.tsx': SOURCE });

      const targets = collectDesignScanFiles(dir, undefined, []);
      expect(targets.files).toHaveLength(2);
      expect(targets.anyCandidateExisted).toBe(true);
    });

    // The divergence that made directory pruning a REGRESSION vs main: the
    // prune used `matchBase` on a globstar-stripped pattern, so a pattern's last
    // segment matched any directory basename at any depth. `vendor/**` pruned
    // `src/vendor` even though the per-file filter KEEPS `src/vendor/nested.css`,
    // and a bare `vendor` — a complete no-op on main — deleted whole subtrees.
    // A real DRIFT-T001 was silently never read. Untested before, hence shipped.
    //
    // The property that has to hold: pruning is a SUBSET of per-file exclusion.
    // The per-file filter can only remove more files, never restore a pruned one.
    // ENCODE the property instead of enumerating patterns. Pinning three
    // literal patterns was real coverage but structurally could not catch a new
    // family — and four counterexample families (brace alternation over
    // non-contiguous depths, leading-bang negation, extension-less extglob, the
    // probe literal itself) existed precisely because nothing asserted the
    // general law. This formulation surfaced all four in one run.
    //
    // The law: the collector's output must EQUAL the walk filtered by the same
    // per-file predicate. There is no longer a directory prune to violate it —
    // that is why it was deleted rather than narrowed — so this test is the
    // guard against reintroducing one.
    it('collect() equals walk-then-filter for every pattern in a corpus', () => {
      dir = project({
        'src/app.css': '.a { color: #ff0000; }',
        'src/a.tsx': SOURCE,
        'src/vendor/nested.css': '.n { color: #ff0000; }',
        'src/vendor/deep/deeper/x.scss': '.d { color: #ff0000; }',
        'vendor/top.css': '.t { color: #ff0000; }',
        'fixtures/f.vue': '<style>.f { color: #ff0000; }</style>',
        'a/b/c/d/e/deep.less': '.z { color: #ff0000; }',
        'README.md': '# not scannable',
      });

      const unfiltered = collectDesignScanFiles(dir, undefined, []).files;
      const CORPUS = [
        'vendor/**',
        'vendor',
        '**/vendor/**',
        'src/*',
        'src/*/vendor',
        'fixtures/**',
        '{src,vendor}/**',
        '**/*',
        '**',
        '*',
        '*.test.css',
        '*.css',
        'src/**',
        'a/b/**',
        '**/deep/**',
        // The four families that broke the prune. Each is a legitimate
        // minimatch pattern an adopter could write.
        'src/{*,*/*/*}',
        '!**/*.css',
        '**/!(*.*)',
        '__harness_prune_probe__',
        '!src/vendor/**',
        '{src/**,!src/vendor/**}',
        '+(src|vendor)/**',
        '?(src)/app.css',
        '**/*.@(css|scss)',
      ];

      const violations: string[] = [];
      for (const pattern of CORPUS) {
        const got = collectDesignScanFiles(dir, undefined, [pattern]).files.sort();
        const want = unfiltered.filter((f) => !isExcluded(dir, f, [pattern])).sort();
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          violations.push(`${pattern}: got ${got.length}, want ${want.length}`);
        }
      }
      expect(violations).toEqual([]);
    });

    it('never prunes a directory whose files the per-file filter would keep', () => {
      dir = project({
        'src/app.css': '.a { color: #ff0000; }',
        'src/vendor/nested.css': '.n { color: #ff0000; }',
        'vendor/top.css': '.t { color: #ff0000; }',
      });

      const rel = (patterns: string[]) =>
        collectDesignScanFiles(dir, undefined, patterns)
          .files.map((f) => path.relative(dir, f).replaceAll('\\', '/'))
          .sort();

      // `vendor/**` is root-anchored: it excludes `vendor/top.css` and NOT
      // `src/vendor/nested.css`, so only the former may disappear.
      expect(rel(['vendor/**'])).toEqual(['src/app.css', 'src/vendor/nested.css']);
      // A bare `vendor` matches no FILE basename here, so it excludes nothing.
      expect(rel(['vendor'])).toEqual(['src/app.css', 'src/vendor/nested.css', 'vendor/top.css']);
      // An unrelated pattern must not touch anything.
      expect(rel(['fixtures/**'])).toEqual([
        'src/app.css',
        'src/vendor/nested.css',
        'vendor/top.css',
      ]);
    });

    it('prunes an excluded directory instead of descending it', () => {
      // design.exclude used to be unable to affect the walk at all: the walk ran
      // first and excludes were applied only to its output, so anything decided
      // on the way down could not be cleared. Now excluded dirs are not entered.
      const deep = path.join('third_party', ...Array.from({ length: 41 }, (_v, i) => `d${i}`));
      dir = project({ [path.join(deep, 'v.css')]: '.v{color:#ff0000}', 'src/a.tsx': SOURCE });

      expect(collectDesignScanFiles(dir, undefined, []).files).toHaveLength(2);
      expect(collectDesignScanFiles(dir, undefined, ['third_party/**']).files).toHaveLength(1);
      expect(collectDesignScanFiles(dir, undefined, ['**/third_party/**']).files).toHaveLength(1);
    });

    it('labels WHY the resolved set is empty, so the message can be specific', () => {
      dir = project({ 'README.md': '# docs\n' });
      expect(collectDesignScanFiles(dir, undefined, []).emptyReason).toBe('no-source');

      const excluded = project({
        'harness.config.json': JSON.stringify({ design: { exclude: ['**/*'] } }),
        'src/List.tsx': SOURCE,
      });
      try {
        expect(
          collectDesignScanFiles(excluded, undefined, resolveDesignExcludePatterns(excluded))
            .emptyReason
        ).toBe('scoped-out');
      } finally {
        fs.rmSync(excluded, { recursive: true, force: true });
      }
    });

    // The remedy must name the key for THE verifier that abstained. Naming all
    // three in every message was better than the `*` glob it replaced and still
    // wrong: the detect-drift abstention told the reader to set
    // `componentAnatomy`.
    it.each([
      ['audit-anatomy', runAudit, 'componentAnatomy'],
      ['detect-design-drift', runDetectDrift, 'driftDetection'],
      ['audit-brand-compliance', runAuditBrand, 'brandCompliance'],
    ] as const)('%s names its OWN opt-out key', async (_n, run, key) => {
      dir = project({
        'harness.config.json': JSON.stringify({ design: { exclude: ['**/*'] } }),
        'src/List.tsx': SOURCE,
      });

      const error = await run({ path: dir, mode: 'full' }).then(
        () => null,
        (e: Error) => e
      );
      expect(error).not.toBeNull();
      expect(error!.message).toContain(`design.audit.${key}.enabled: false`);
      // ...and NOT the other two.
      for (const other of ['componentAnatomy', 'driftDetection', 'brandCompliance']) {
        if (other !== key) expect(error!.message).not.toContain(`design.audit.${other}.`);
      }
      // The message must not promise something the disabled path contradicts:
      // disabling returns `valid: true` and exit 0, so "never a pass" was a lie.
      expect(error!.message).not.toContain('never a pass');
      expect(error!.message).toContain('record it as not-run rather than as clean');
      // The remedy must be SCOPED to the entry points that actually read the
      // key. `design.audit.*.enabled` is read in exactly two places
      // (check-design.ts, validate.ts); `harness align`, the design pipeline
      // and the three MCP tools call these runners directly and keep
      // abstaining. Advertising an escape that does nothing on 5 of 7 entry
      // points is the same defect as advertising one that did nothing on the
      // affected command — which is what round 3 found.
      expect(error!.message).toContain('harness check-design');
      expect(error!.message).toContain('harness validate');
      expect(error!.message).toMatch(/Only those two commands read that key/);
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
