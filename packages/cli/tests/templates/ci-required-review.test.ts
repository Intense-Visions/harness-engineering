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
});
