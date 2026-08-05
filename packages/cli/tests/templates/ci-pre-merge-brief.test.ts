import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { TemplateEngine, type TemplateContext } from '../../src/templates/engine';

const TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
const CI_DIR = path.join(TEMPLATES, 'ci-pre-merge-brief');

describe('ci-pre-merge-brief template', () => {
  it('ruleset required-check context matches the workflow job name', () => {
    // Parse the RAW .hbs: the literal `name: pre-merge-brief` and the quoted
    // Handlebars tokens are valid YAML, so the job name is stable on the raw file.
    const wf = yaml.parse(fs.readFileSync(path.join(CI_DIR, 'pre-merge-brief.yml.hbs'), 'utf-8'));
    const jobName = wf.jobs['pre-merge-brief'].name;

    const ruleset = JSON.parse(
      fs.readFileSync(path.join(CI_DIR, 'pre-merge-brief.ruleset.json'), 'utf-8')
    );
    const checks = ruleset.rules.find((r: { type: string }) => r.type === 'required_status_checks')
      .parameters.required_status_checks;
    const contexts = checks.map((c: { context: string }) => c.context);

    expect(jobName).toBe('pre-merge-brief');
    expect(contexts).toContain(jobName);
  });

  it('renders the workflow with substituted runner/blockOn/baseBranch into valid YAML', () => {
    const engine = new TemplateEngine(TEMPLATES);
    const resolved = {
      metadata: {
        name: 'ci-pre-merge-brief',
        description: 'x',
        version: 1 as const,
        mergeStrategy: { json: 'deep-merge' as const, files: 'overlay-wins' as const },
      },
      files: [
        {
          relativePath: 'pre-merge-brief.yml.hbs',
          absolutePath: path.join(CI_DIR, 'pre-merge-brief.yml.hbs'),
          isHandlebars: true,
          sourceTemplate: 'ci-pre-merge-brief',
        },
      ],
    };
    // TemplateContext does not declare runner/blockOn/baseBranch, but Handlebars
    // renders by key regardless of the TS interface — cast the extra keys in.
    const result = engine.render(resolved, {
      projectName: 'demo',
      runner: 'claude',
      blockOn: 'request-changes',
      baseBranch: 'main',
    } as unknown as TemplateContext);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The engine strips `.hbs`, so the rendered file is `pre-merge-brief.yml`.
    const wf = result.value.files.find((f) => f.relativePath === 'pre-merge-brief.yml');
    expect(wf).toBeDefined();

    const parsed = yaml.parse(wf!.content); // throws if invalid YAML
    const job = parsed.jobs['pre-merge-brief'];
    expect(job.name).toBe('pre-merge-brief');

    // The review step runs review-ci with substituted runner/block-on and writes
    // the artifact the brief step consumes via `--out`.
    const reviewStep = job.steps.find(
      (s: { run?: string }) => typeof s.run === 'string' && s.run.includes('review-ci')
    );
    expect(reviewStep.run).toContain('--runner claude');
    expect(reviewStep.run).toContain('--block-on request-changes');
    expect(reviewStep.run).toContain('--out /tmp/review.json');
    // A blocking verdict must not fail the informational brief job.
    expect(reviewStep['continue-on-error']).toBe(true);

    // The brief step composes + upserts the sticky comment, reusing the artifact.
    const briefStep = job.steps.find(
      (s: { run?: string }) => typeof s.run === 'string' && s.run.includes('pre-merge-brief')
    );
    expect(briefStep.run).toContain('--from /tmp/review.json');
    expect(briefStep.run).toContain('--comment');

    expect(parsed.on.pull_request.branches).toContain('main');

    // Both harness steps must diff against the PR's real base via the runtime
    // `github.base_ref` expression, NOT the CLI's origin/HEAD fallback (which can
    // silently review the wrong/empty diff on a pull_request event).
    expect(reviewStep.run).toContain('--diff "origin/${{ github.base_ref }}...HEAD"');
    expect(briefStep.run).toContain('--diff "origin/${{ github.base_ref }}...HEAD"');

    // A step fetches the PR base so origin/${{ github.base_ref }} resolves.
    const fetchStep = job.steps.find(
      (s: { run?: string }) => typeof s.run === 'string' && s.run.includes('git fetch origin')
    );
    expect(fetchStep).toBeDefined();
    expect(fetchStep.run).toContain('git fetch origin ${{ github.base_ref }}');

    // The brief upserts a sticky PR comment, so it needs pull-requests: write;
    // review-ci itself only reads the diff.
    expect(parsed.permissions['contents']).toBe('read');
    expect(parsed.permissions['pull-requests']).toBe('write');

    // GitHub `${{ secrets.X }}` expressions survived Handlebars verbatim, including
    // the GITHUB_TOKEN the brief posts its comment with:
    expect(wf!.content).toContain('${{ secrets.ANTHROPIC_API_KEY }}');
    expect(job.env.ANTHROPIC_API_KEY).toBe('${{ secrets.ANTHROPIC_API_KEY }}');
    expect(job.env.GH_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');

    // An escaped GH expression and a substituted Handlebars var coexist on one
    // line (the review step has a literal ${{ github.base_ref }} AND a real
    // {{runner}} -> claude substitution). Proves the per-line escaping is correct.
    expect(reviewStep.run).toContain('${{ github.base_ref }}');
    expect(reviewStep.run).toContain('--runner claude');

    // No stray escaping artifact leaked into the output:
    expect(wf!.content).not.toContain('\\{{');
  });

  it('is discoverable as a named template (not a level scaffold)', () => {
    const engine = new TemplateEngine(TEMPLATES);
    const list = engine.listTemplates();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const ci = list.value.find((t) => t.name === 'ci-pre-merge-brief');
    expect(ci).toBeDefined();
    expect(ci!.level).toBeUndefined();
    expect(ci!.framework).toBeUndefined();
  });

  it('resolves + renders through the real init path (`--template ci-pre-merge-brief`)', () => {
    // `harness init --template ci-pre-merge-brief` passes the template name in as
    // `level` (commands/init.ts). This is the exact resolution call init makes,
    // and is what proves the workflow is emitted into an adopter repo — the
    // hand-built engine.render() test above never exercises resolveTemplate.
    const engine = new TemplateEngine(TEMPLATES);
    const resolved = engine.resolveTemplate('ci-pre-merge-brief', undefined, 'typescript');
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    // Named standalone template: no `extends`, so ONLY its own files resolve —
    // the pre-merge-brief workflow, ruleset, and README, and no basic/base
    // level-scaffold files (e.g. harness.config.json / AGENTS.md) leak in.
    const paths = resolved.value.files.map((f) => f.relativePath).sort();
    expect(paths).toEqual(
      ['README.md', 'pre-merge-brief.ruleset.json', 'pre-merge-brief.yml.hbs'].sort()
    );

    // Render with the same defaults commands/init.ts supplies. Strict-mode
    // Handlebars would throw if a referenced var were missing.
    const rendered = engine.render(resolved.value, {
      projectName: 'demo',
      level: '',
      runner: 'claude',
      blockOn: 'request-changes',
      baseBranch: 'main',
    });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    // The `.hbs` is stripped: `harness init --template ci-pre-merge-brief` emits
    // the runnable `pre-merge-brief.yml` workflow.
    const wf = rendered.value.files.find((f) => f.relativePath === 'pre-merge-brief.yml');
    expect(wf).toBeDefined();
    expect(wf!.content).toContain('name: pre-merge-brief');
    expect(wf!.content).toContain('--runner claude');
  });
});
