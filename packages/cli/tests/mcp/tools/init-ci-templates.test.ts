import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { initProjectDefinition, handleInitProject } from '../../../src/mcp/tools/init';
import { runInit } from '../../../src/commands/init';
import { TemplateEngine } from '../../../src/templates/engine';
import { resolveTemplatesDir } from '../../../src/utils/paths';
import { NAMED_TEMPLATE_DEFAULTS } from '../../../src/templates/named-template-vars';

// #2630: init_project could not render the opt-in ci-* templates — it had no
// `template` input, and routing the name through `level` failed strict
// Handlebars rendering ("baseBranch" not defined) because only the CLI supplied
// runner/blockOn/baseBranch.

const CI_TEMPLATES = [
  { name: 'ci-required-review', workflow: 'required-review.yml' },
  { name: 'ci-pre-merge-brief', workflow: 'pre-merge-brief.yml' },
] as const;

const dirs: string[] = [];
function gitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mcp-init-ci-'));
  dirs.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** Locate the rendered workflow wherever the template places it (root or .github/workflows). */
function findWorkflow(root: string, basename: string): string {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === basename || entry.name === `harness-${basename}`) hits.push(full);
    }
  };
  walk(root);
  expect(hits, `expected exactly one ${basename} under ${root}`).toHaveLength(1);
  return hits[0]!;
}

function text(res: { content: { text: string }[] }): string {
  return res.content.map((c) => c.text).join('\n');
}

describe('init_project MCP tool — opt-in ci-* templates (#2630)', () => {
  it('exposes template, runner, blockOn and baseBranch as optional inputs', () => {
    const props = initProjectDefinition.inputSchema.properties as Record<string, unknown>;
    for (const key of ['template', 'runner', 'blockOn', 'baseBranch']) {
      expect(props).toHaveProperty(key);
    }
    expect(initProjectDefinition.inputSchema.required).toEqual(['path']);
  });

  for (const t of CI_TEMPLATES) {
    it(`renders ${t.name} with the same content as the CLI path for identical inputs`, async () => {
      const mcpDir = gitRepo();
      const res = await handleInitProject({ path: mcpDir, name: 'demo', template: t.name });
      expect(res.isError, text(res)).toBeFalsy();
      const mcpWorkflow = fs.readFileSync(findWorkflow(mcpDir, t.workflow), 'utf-8');

      const cliDir = gitRepo();
      const cli = await runInit({ cwd: cliDir, name: 'demo', level: t.name });
      expect(cli.ok).toBe(true);
      const cliWorkflow = fs.readFileSync(findWorkflow(cliDir, t.workflow), 'utf-8');

      expect(mcpWorkflow).toBe(cliWorkflow);
      expect(mcpWorkflow).toContain(`branches: ['${NAMED_TEMPLATE_DEFAULTS.baseBranch}']`);
      expect(mcpWorkflow).toContain(
        `--runner ${NAMED_TEMPLATE_DEFAULTS.runner} --block-on ${NAMED_TEMPLATE_DEFAULTS.blockOn}`
      );
    });

    it(`threads runner/blockOn/baseBranch overrides into ${t.name}`, async () => {
      const dir = gitRepo();
      const res = await handleInitProject({
        path: dir,
        template: t.name,
        runner: 'gemini',
        blockOn: 'comment',
        baseBranch: 'develop',
      });
      expect(res.isError, text(res)).toBeFalsy();
      const wf = fs.readFileSync(findWorkflow(dir, t.workflow), 'utf-8');
      expect(wf).toContain("branches: ['develop']");
      expect(wf).toContain('--runner gemini --block-on comment');
    });
  }

  it('rejects an unknown runner with a clear isError instead of rendering a broken workflow', async () => {
    const dir = gitRepo();
    const res = await handleInitProject({
      path: dir,
      template: 'ci-required-review',
      runner: 'not-a-runner',
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('Unknown runner "not-a-runner"');
    expect(fs.readdirSync(dir)).toEqual(['.git']);
  });

  it('names the missing variable when a template is rendered without it', () => {
    const engine = new TemplateEngine(resolveTemplatesDir());
    const resolved = engine.resolveTemplate('ci-required-review');
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const rendered = engine.render(resolved.value, {
      projectName: 'demo',
      runner: 'claude',
      blockOn: 'request-changes',
    });
    expect(rendered.ok).toBe(false);
    if (rendered.ok) return;
    expect(rendered.error.message).toContain('missing template variable "baseBranch"');
    expect(rendered.error.message).not.toContain('[object Object]');
  });

  it('positive control: the default adoption-level scaffold still renders via MCP', async () => {
    const dir = gitRepo();
    const res = await handleInitProject({ path: dir, name: 'demo' });
    expect(res.isError, text(res)).toBeFalsy();
    expect(fs.existsSync(path.join(dir, 'harness.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
  });
});
