import { describe, it, expect, beforeAll } from 'vitest';
import { createCheckDepsCommand, runCheckDeps } from '../../src/commands/check-deps';
import * as fs from 'fs';
import * as path from 'path';

describe('check-deps command', () => {
  const noLayersPath = path.join(__dirname, '../fixtures/deps-no-layers');

  // The vendored-cycle fixture's `node_modules/` files are matched by the repo
  // root .gitignore (`node_modules/`), so they are NOT committed and are absent
  // on a fresh clone / in CI. Materialize the mutual-import cycle at runtime so
  // the #1188 regression genuinely reproduces the bug everywhere, not just on
  // the authoring machine. The committed fixture ships only harness.config.json
  // + src/index.ts.
  const vendoredCycleDir = path.join(__dirname, '../fixtures/deps-node-modules-cycle');
  beforeAll(() => {
    const vendorDir = path.join(vendoredCycleDir, 'src/node_modules/vendor');
    fs.mkdirSync(vendorDir, { recursive: true });
    fs.writeFileSync(path.join(vendorDir, 'a.ts'), "import './b';\nexport const a = 1;\n");
    fs.writeFileSync(path.join(vendorDir, 'b.ts'), "import './a';\nexport const b = 1;\n");
  });

  describe('runCheckDeps', () => {
    it('returns success when no layers configured', async () => {
      const result = await runCheckDeps({
        cwd: noLayersPath,
        configPath: path.join(noLayersPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
      }
    });

    it('exposes modulesAnalyzed on the result (#1188)', async () => {
      const dir = path.join(__dirname, '../fixtures/deps-first-party-cycle');
      const result = await runCheckDeps({
        cwd: dir,
        configPath: path.join(dir, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.modulesAnalyzed).toBe('number');
        expect(result.value.modulesAnalyzed).toBeGreaterThan(0);
        expect(result.value.layersConfigured).toBe(1);
      }
    });

    // Regression for #1188: a layer pattern transitively covering a node_modules
    // package with an internal cycle must NOT fail check-deps (vendored cycles
    // are excluded by the default DEFAULT_FIND_FILES_IGNORE skip set).
    it('does not report cycles inside vendored node_modules (#1188)', async () => {
      const dir = vendoredCycleDir;
      const result = await runCheckDeps({
        cwd: dir,
        configPath: path.join(dir, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.circularDeps).toHaveLength(0);
        expect(result.value.valid).toBe(true);
      }
    });

    // Regression for #1188: a first-party cycle under a layer pattern STILL fails,
    // and the finding is attributed to a real file (not "* unknown").
    it('still fails on first-party cycles and attributes them to a file (#1188)', async () => {
      const dir = path.join(__dirname, '../fixtures/deps-first-party-cycle');
      const result = await runCheckDeps({
        cwd: dir,
        configPath: path.join(dir, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(false);
        expect(result.value.circularDeps.length).toBeGreaterThan(0);
        expect(result.value.circularDeps[0]!.file).toMatch(/src\/(a|b)\.ts$/);
      }
    });

    // Regression for #1188: deps.exclude suppresses additional configured paths.
    it('honors deps.exclude to suppress a first-party cycle path (#1188)', async () => {
      // Reuse the first-party fixture but with a deps.exclude that removes src/**.
      const dir = path.join(__dirname, '../fixtures/deps-first-party-cycle');
      const result = await runCheckDeps({
        cwd: dir,
        configPath: path.join(dir, 'harness.exclude.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.modulesAnalyzed).toBe(0);
        // zero modules with layers configured => abstention fail (D5),
        // proving deps.exclude removed the files from discovery.
        expect(result.value.valid).toBe(false);
      }
    });

    // Regression for #1188: layers configured but nothing matched => fail (D5).
    it('fails (does not report clean) when layers are configured but zero modules analyzed (#1188)', async () => {
      const emptyLayersPath = path.join(__dirname, '../fixtures/deps-empty-layers');
      const result = await runCheckDeps({
        cwd: emptyLayersPath,
        configPath: path.join(emptyLayersPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.modulesAnalyzed).toBe(0);
        expect(result.value.valid).toBe(false);
        expect(result.value.analysisNote).toBeTruthy();
      }
    });
  });

  describe('createCheckDepsCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckDepsCommand();
      expect(cmd.name()).toBe('check-deps');
    });
  });
});
