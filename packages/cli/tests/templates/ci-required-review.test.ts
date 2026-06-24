import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { TemplateEngine, type TemplateContext } from '../../src/templates/engine';

const TEMPLATES = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
const CI_DIR = path.join(TEMPLATES, 'ci');

describe('ci-required-review template', () => {
  it('ruleset required-check context matches the workflow job name (SC6)', () => {
    // Parse the RAW .hbs: the literal `name: required-review` and the quoted
    // Handlebars tokens are valid YAML, so the job name is stable on the raw file.
    const wf = yaml.parse(fs.readFileSync(path.join(CI_DIR, 'required-review.yml.hbs'), 'utf-8'));
    const jobName = wf.jobs['required-review'].name;

    const ruleset = JSON.parse(
      fs.readFileSync(path.join(CI_DIR, 'required-review.ruleset.json'), 'utf-8')
    );
    const checks = ruleset.rules.find((r: { type: string }) => r.type === 'required_status_checks')
      .parameters.required_status_checks;
    const contexts = checks.map((c: { context: string }) => c.context);

    expect(jobName).toBe('required-review');
    expect(contexts).toContain(jobName);
  });

  it('renders the workflow with substituted runner/blockOn/baseBranch into valid YAML (SC7)', () => {
    const engine = new TemplateEngine(TEMPLATES);
    const resolved = {
      metadata: {
        name: 'ci-required-review',
        description: 'x',
        version: 1 as const,
        mergeStrategy: { json: 'deep-merge' as const, files: 'overlay-wins' as const },
      },
      files: [
        {
          relativePath: 'required-review.yml.hbs',
          absolutePath: path.join(CI_DIR, 'required-review.yml.hbs'),
          isHandlebars: true,
          sourceTemplate: 'ci',
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

    // The engine strips `.hbs`, so the rendered file is `required-review.yml`.
    const wf = result.value.files.find((f) => f.relativePath === 'required-review.yml');
    expect(wf).toBeDefined();

    const parsed = yaml.parse(wf!.content); // throws if invalid YAML
    expect(parsed.jobs['required-review'].name).toBe('required-review');

    const runStep = parsed.jobs['required-review'].steps.find(
      (s: { run?: string }) => typeof s.run === 'string' && s.run.includes('review-ci')
    );
    expect(runStep.run).toContain('--runner claude');
    expect(runStep.run).toContain('--block-on request-changes');
    expect(parsed.on.pull_request.branches).toContain('main');

    // GitHub `${{ secrets.X }}` expressions survived Handlebars verbatim:
    expect(wf!.content).toContain('${{ secrets.ANTHROPIC_API_KEY }}');
    expect(parsed.jobs['required-review'].env.ANTHROPIC_API_KEY).toBe(
      '${{ secrets.ANTHROPIC_API_KEY }}'
    );
    // No stray escaping artifact leaked into the output:
    expect(wf!.content).not.toContain('\\{{');
  });
});
