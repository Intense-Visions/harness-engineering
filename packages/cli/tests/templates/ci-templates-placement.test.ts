import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'yaml';
import { runInit } from '../../src/commands/init';

/**
 * #2630 (a): the opt-in CI templates must land where GitHub Actions runs them.
 *
 * `harness init -t ci-required-review` / `-t ci-pre-merge-brief` used to render
 * the workflow at the repo ROOT (GitHub never runs it, so the ruleset then
 * requires a check that never reports), wrote the template's own README as the
 * project README, and wrote NOTHING of the template into an existing project.
 * These tests drive the real `runInit` path end-to-end into temp directories.
 */

const CASES = [
  {
    template: 'ci-required-review',
    workflow: '.github/workflows/harness-required-review.yml',
    rootWorkflow: 'required-review.yml',
    job: 'required-review',
    ruleset: 'required-review.ruleset.json',
    doc: '.github/harness/ci-required-review.md',
  },
  {
    template: 'ci-pre-merge-brief',
    workflow: '.github/workflows/harness-pre-merge-brief.yml',
    rootWorkflow: 'pre-merge-brief.yml',
    job: 'pre-merge-brief',
    ruleset: 'pre-merge-brief.ruleset.json',
    doc: '.github/harness/ci-pre-merge-brief.md',
  },
] as const;

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-ci-tpl-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function expectRunnableWorkflow(dir: string, c: (typeof CASES)[number]): void {
  const wfPath = path.join(dir, ...c.workflow.split('/'));
  expect(fs.existsSync(wfPath), `${c.workflow} exists`).toBe(true);
  const parsed = yaml.parse(fs.readFileSync(wfPath, 'utf-8'));
  expect(parsed.jobs[c.job].name).toBe(c.job);
  // The ruleset binds the same check name the workflow reports.
  const ruleset = JSON.parse(fs.readFileSync(path.join(dir, c.ruleset), 'utf-8'));
  const contexts = ruleset.rules
    .find((r: { type: string }) => r.type === 'required_status_checks')
    .parameters.required_status_checks.map((x: { context: string }) => x.context);
  expect(contexts).toContain(c.job);
  // Never at the root, where GitHub Actions does not look.
  expect(fs.existsSync(path.join(dir, c.rootWorkflow))).toBe(false);
}

describe.each(CASES)('$template placement (#2630)', (c) => {
  it('renders the workflow under .github/workflows/ and the template doc off the README path', async () => {
    const dir = tmp();
    const result = await runInit({ cwd: dir, name: 'demo', level: c.template });
    expect(result.ok).toBe(true);
    expectRunnableWorkflow(dir, c);
    expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, ...c.doc.split('/')))).toBe(true);
  });

  it('writes the gate into an existing project without touching its README', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'README.md'), '# My Project\n');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"my-project"}\n');
    const result = await runInit({ cwd: dir, name: 'demo', level: c.template });
    expect(result.ok).toBe(true);
    expectRunnableWorkflow(dir, c);
    expect(fs.readFileSync(path.join(dir, 'README.md'), 'utf-8')).toBe('# My Project\n');
    expect(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).toBe(
      '{"name":"my-project"}\n'
    );
  });

  it('never overwrites an existing workflow file and reports the skip', async () => {
    const dir = tmp();
    const wfPath = path.join(dir, ...c.workflow.split('/'));
    fs.mkdirSync(path.dirname(wfPath), { recursive: true });
    fs.writeFileSync(wfPath, 'name: mine\n');
    const result = await runInit({ cwd: dir, name: 'demo', level: c.template });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fs.readFileSync(wfPath, 'utf-8')).toBe('name: mine\n');
    expect(result.value.skippedExisting).toContain(c.workflow);
  });

  it('does not collide with the load-bearing-minimum required-review workflow (either order)', async () => {
    // LBM first, then layer the CI template on (re-init needs --force).
    const a = tmp();
    expect((await runInit({ cwd: a, name: 'demo', level: 'load-bearing-minimum' })).ok).toBe(true);
    const lbmWf = path.join(a, '.github', 'workflows', 'required-review.yml');
    const lbmBefore = fs.readFileSync(lbmWf, 'utf-8');
    expect((await runInit({ cwd: a, name: 'demo', level: c.template, force: true })).ok).toBe(true);
    expect(fs.readFileSync(lbmWf, 'utf-8')).toBe(lbmBefore);
    expectRunnableWorkflow(a, c);

    // CI template first, then the LBM scaffold.
    const b = tmp();
    expect((await runInit({ cwd: b, name: 'demo', level: c.template })).ok).toBe(true);
    const ciBefore = fs.readFileSync(path.join(b, ...c.workflow.split('/')), 'utf-8');
    expect((await runInit({ cwd: b, name: 'demo', level: 'load-bearing-minimum' })).ok).toBe(true);
    expect(fs.readFileSync(path.join(b, ...c.workflow.split('/')), 'utf-8')).toBe(ciBefore);
    expect(
      fs.readFileSync(path.join(b, '.github', 'workflows', 'required-review.yml'), 'utf-8')
    ).toContain('harness outcome-eval-ci');
  });
});
