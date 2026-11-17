// packages/cli/tests/integration/agents-map-verdict-parity.test.ts
//
// #2669 — the AGENTS.md required-section check must reach ONE verdict, at ONE
// severity, on every surface that runs it. Before this test the same tree got:
//   - MCP `validate_project`:  valid:false, missing sections in `errors` (blocking)
//   - CLI `harness validate`:  valid:true, the finding not reported at all
//   - `harness ci check`:      status warn
// and every harness scaffold shipped an AGENTS.md that failed harness's own
// section check, so the disagreement fired on a freshly initialised project.
//
// Everything here runs the REAL validators against a REAL `runInit` scaffold — no
// mocks — so the test fails if any surface forks the verdict again.
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCIChecks, validateAgentsMap, REQUIRED_SECTIONS } from '@harness-engineering/core';
import { runInit } from '../../src/commands/init';
import { runValidate } from '../../src/commands/validate';
import { handleValidateProject } from '../../src/mcp/tools/validate';

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

async function scaffold(
  slug: string,
  opts: { level?: string; framework?: string; language?: string }
): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agents-parity-${slug}-`));
  tmpDirs.push(dir);
  const result = await runInit({ cwd: dir, name: `parity-${slug}`, ...opts });
  if (!result.ok) throw new Error(`runInit(${slug}) failed: ${result.error.message}`);
  return dir;
}

/** The three surfaces' AGENTS.md-section findings, normalised to `{severity, message}`. */
async function sectionVerdicts(dir: string) {
  // MCP validate_project (default, non-affected path)
  const mcpRaw = await handleValidateProject({ path: dir });
  const mcp = JSON.parse(mcpRaw.content[0]!.text) as {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  };

  // CLI harness validate
  const cliResult = await runValidate({ cwd: dir });
  if (!cliResult.ok) throw new Error(`runValidate failed: ${cliResult.error.message}`);
  const cli = cliResult.value;

  // harness ci check — the validate check alone
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8'));
  const ciResult = await runCIChecks({
    projectRoot: dir,
    config,
    skip: ['deps', 'docs', 'entropy', 'security', 'perf', 'phase-gate', 'arch', 'traceability'],
  });
  if (!ciResult.ok) throw new Error(`runCIChecks failed: ${ciResult.error.message}`);
  const ciValidate = ciResult.value.checks.find((c) => c.name === 'validate')!;

  const isSection = (m: string) => m.startsWith('Missing section: ');
  return {
    mcp: {
      valid: mcp.valid,
      blocking: mcp.errors.filter((e) => /missing section/i.test(e)),
      warnings: (mcp.warnings ?? []).filter(isSection),
    },
    cli: {
      valid: cli.valid,
      findings: cli.issues
        .filter((i) => i.check === 'agentsMap' && isSection(i.message))
        .map((i) => ({ severity: i.severity ?? 'error', message: i.message })),
    },
    ci: {
      status: ciValidate.status,
      findings: ciValidate.issues
        .filter((i) => isSection(i.message))
        .map((i) => ({ severity: i.severity, message: i.message })),
    },
  };
}

const SCAFFOLDS: Array<{
  slug: string;
  opts: { level?: string; framework?: string; language?: string };
}> = [
  { slug: 'basic', opts: { level: 'basic' } },
  { slug: 'intermediate', opts: { level: 'intermediate' } },
  { slug: 'load-bearing-minimum', opts: { level: 'load-bearing-minimum' } },
  { slug: 'advanced', opts: { level: 'advanced' } },
  { slug: 'nextjs', opts: { framework: 'nextjs' } },
  { slug: 'express', opts: { framework: 'express' } },
  { slug: 'nestjs', opts: { framework: 'nestjs' } },
  { slug: 'react-vite', opts: { framework: 'react-vite' } },
  { slug: 'vue', opts: { framework: 'vue' } },
  { slug: 'fastapi', opts: { framework: 'fastapi' } },
  { slug: 'django', opts: { framework: 'django' } },
  { slug: 'gin', opts: { framework: 'gin' } },
  { slug: 'axum', opts: { framework: 'axum' } },
  { slug: 'spring-boot', opts: { framework: 'spring-boot' } },
  { slug: 'python', opts: { language: 'python' } },
  { slug: 'go', opts: { language: 'go' } },
  { slug: 'rust', opts: { language: 'rust' } },
  { slug: 'java', opts: { language: 'java' } },
];

describe('every template scaffold passes its own AGENTS.md section check (#2669)', () => {
  for (const { slug, opts } of SCAFFOLDS) {
    it(`${slug} scaffold has every required section`, async () => {
      const dir = await scaffold(slug, opts);
      const result = await validateAgentsMap(path.join(dir, 'AGENTS.md'));
      if (!result.ok) throw new Error(result.error.message);
      expect(result.value.missingSections).toEqual([]);
    });
  }
});

describe('MCP validate_project, CLI validate and ci check agree on AGENTS.md sections (#2669)', () => {
  it('a clean nextjs scaffold: all three valid, no section finding anywhere', async () => {
    const dir = await scaffold('parity-clean', { framework: 'nextjs' });
    const v = await sectionVerdicts(dir);

    expect(v.mcp.valid).toBe(true);
    expect(v.mcp.blocking).toEqual([]);
    expect(v.mcp.warnings).toEqual([]);
    expect(v.cli.valid).toBe(true);
    expect(v.cli.findings).toEqual([]);
    expect(v.ci.findings).toEqual([]);
  });

  it('a deliberately section-less AGENTS.md: one non-blocking warning per section, on all three', async () => {
    const dir = await scaffold('parity-broken', { framework: 'nextjs' });
    fs.writeFileSync(
      path.join(dir, 'AGENTS.md'),
      '# parity-broken\n\n## Notes\n\nNothing required lives here.\n'
    );
    const v = await sectionVerdicts(dir);

    const expected = REQUIRED_SECTIONS.map((s) => ({
      severity: 'warning',
      message: `Missing section: ${s}`,
    }));

    // Non-blocking on every surface: the finding never flips the verdict.
    expect(v.mcp.valid).toBe(true);
    expect(v.mcp.blocking).toEqual([]);
    expect(v.cli.valid).toBe(true);
    expect(v.ci.status).toBe('warn');

    // ...and reported identically on every surface.
    expect(v.mcp.warnings).toEqual(expected.map((e) => e.message));
    expect(v.cli.findings).toEqual(expected);
    expect(v.ci.findings).toEqual(expected);
  });
});
