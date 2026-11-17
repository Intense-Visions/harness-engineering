import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInit, buildNextSteps } from '../../src/commands/init';
import { runValidate } from '../../src/commands/validate';
import { handleInitProject } from '../../src/mcp/tools/init';

/**
 * #2670 — found by a smoke of the published cli@14.1.0.
 *
 * D: `harness init -t orchestrator|ci-required-review|ci-pre-merge-brief` into an
 *    EMPTY directory exited 0 and printed "Review harness.config.json … Run
 *    harness validate", but wrote no harness.config.json, so validate failed.
 * E: an add-on template (`-t ci-*`) on an ALREADY-initialized project was refused
 *    ("Project already initialized. Use --force to overwrite.") even though the
 *    add-on write path (#2650) exists precisely to layer onto existing projects
 *    without overwriting anything.
 */

const ADD_ONS = [
  {
    template: 'ci-required-review',
    files: [
      '.github/workflows/harness-required-review.yml',
      'required-review.ruleset.json',
      '.github/harness/ci-required-review.md',
    ],
  },
  {
    template: 'ci-pre-merge-brief',
    files: [
      '.github/workflows/harness-pre-merge-brief.yml',
      'pre-merge-brief.ruleset.json',
      '.github/harness/ci-pre-merge-brief.md',
    ],
  },
] as const;

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-named-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Every file under `root` (posix-relative) mapped to its bytes. */
function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else
        out.set(
          path.relative(root, full).split(path.sep).join('/'),
          fs.readFileSync(full, 'utf-8')
        );
    }
  };
  walk(root);
  return out;
}

describe('D: named templates into an empty directory (#2670)', () => {
  it('orchestrator writes a harness.config.json, so its next steps and validate agree', async () => {
    const dir = tmp();
    const result = await runInit({ cwd: dir, name: 'demo', level: 'orchestrator' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fs.existsSync(path.join(dir, 'harness.orchestrator.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'harness.config.json'))).toBe(true);
    expect(result.value.filesCreated).toContain('harness.config.json');

    const steps = buildNextSteps(dir, { addOn: false }).join('\n');
    expect(steps).toContain('Review harness.config.json');
    expect(steps).toContain('harness validate');

    // Pin the config: bare discovery walks up from process.cwd(), not `cwd`.
    const validate = await runValidate({
      configPath: path.join(dir, 'harness.config.json'),
      cwd: dir,
    });
    expect(validate.ok, validate.ok ? '' : validate.error.message).toBe(true);
    if (validate.ok) expect(validate.value.valid, JSON.stringify(validate.value.issues)).toBe(true);
  });

  describe.each(ADD_ONS)('$template (add-on)', (c) => {
    it('writes only its own files and its next steps do not claim a config it never wrote', async () => {
      const dir = tmp();
      const result = await runInit({ cwd: dir, name: 'demo', level: c.template });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const f of c.files) expect(result.value.filesCreated).toContain(f);
      // No project scaffold: no config, no generic CI workflow that would run
      // `harness ci check` against a repo with no config, no roadmap.
      expect(fs.existsSync(path.join(dir, 'harness.config.json'))).toBe(false);
      expect(result.value.filesCreated).not.toContain('.github/workflows/ci.yml');
      expect(fs.existsSync(path.join(dir, 'docs', 'roadmap.d'))).toBe(false);

      const steps = buildNextSteps(dir, { addOn: true }).join('\n');
      expect(steps).not.toContain('Review harness.config.json');
      expect(steps).toContain('no harness.config.json');
      expect(steps).toContain('harness init');

      // Consistent with what validate actually reports for this directory.
      const validate = await runValidate({
        configPath: path.join(dir, 'harness.config.json'),
        cwd: dir,
      });
      expect(validate.ok).toBe(false);
    });
  });
});

describe('E: add-on templates on an already-initialized project (#2670)', () => {
  describe.each(ADD_ONS)('$template', (c) => {
    it('CLI: layers on without --force, writes only new files, leaves every existing file untouched', async () => {
      const dir = tmp();
      expect((await runInit({ cwd: dir, name: 'demo', level: 'basic' })).ok).toBe(true);
      const before = snapshot(dir);

      const result = await runInit({ cwd: dir, name: 'demo', level: c.template });
      expect(result.ok, result.ok ? '' : result.error.message).toBe(true);
      if (!result.ok) return;
      expect(result.value.upgradedFrom).toBeUndefined();
      expect([...result.value.filesCreated].sort()).toEqual([...c.files].sort());

      const after = snapshot(dir);
      for (const [file, content] of before) {
        expect(after.get(file), `${file} untouched`).toBe(content);
      }
      const added = [...after.keys()].filter((f) => !before.has(f)).sort();
      expect(added).toEqual([...c.files].sort());

      const steps = buildNextSteps(dir, { addOn: true }).join('\n');
      expect(steps).toContain('harness validate');
      expect(steps).not.toContain('no harness.config.json');
    });

    it('CLI: a second add-on run keeps the files it already wrote', async () => {
      const dir = tmp();
      expect((await runInit({ cwd: dir, name: 'demo', level: 'basic' })).ok).toBe(true);
      expect((await runInit({ cwd: dir, name: 'demo', level: c.template })).ok).toBe(true);
      const wf = path.join(dir, ...c.files[0].split('/'));
      fs.writeFileSync(wf, 'name: mine\n');
      const again = await runInit({ cwd: dir, name: 'demo', level: c.template });
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(fs.readFileSync(wf, 'utf-8')).toBe('name: mine\n');
      expect(again.value.skippedExisting).toContain(c.files[0]);
    });

    it('MCP init_project: the same add-on layers on identically', async () => {
      const dir = tmp();
      expect((await runInit({ cwd: dir, name: 'demo', level: 'basic' })).ok).toBe(true);
      const before = snapshot(dir);
      const res = await handleInitProject({ path: dir, name: 'demo', template: c.template });
      expect(res.isError, res.content.map((x) => x.text).join('\n')).toBeFalsy();
      const after = snapshot(dir);
      for (const [file, content] of before) {
        expect(after.get(file), `${file} untouched`).toBe(content);
      }
      const added = [...after.keys()].filter((f) => !before.has(f)).sort();
      expect(added).toEqual([...c.files].sort());
    });
  });

  it('positive control: a non-add-on re-init still refuses without --force', async () => {
    const dir = tmp();
    expect((await runInit({ cwd: dir, name: 'demo', level: 'basic' })).ok).toBe(true);
    const before = snapshot(dir);
    const again = await runInit({ cwd: dir, name: 'demo', level: 'orchestrator' });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.message).toContain('already initialized');
    expect(snapshot(dir)).toEqual(before);
  });
});
