// packages/cli/tests/mcp/tools/craft-scope.test.ts
//
// #2625 (follow-up of #2622, class #2084): every craft MCP tool must refuse a
// `path` that does not exist or is not a directory, and must ABSTAIN, not
// report a clean critique, when an existing scope yields zero candidates.
//
// Before the fix, a nonexistent path came back from every `mode: 'inline'`
// run (and from design_craft in any mode) as `findings: []`, the same output
// as a clean critique. In-session runs errored only because the run-state
// mkdir hit ENOENT, and under a writable parent that mkdir CREATED the
// missing directory. An empty directory came back as `status: collected,
// pendingPrompts: []` or `findings: []` from every tool except security_craft.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleApiCraft, handleApiCraftFinalize } from '../../../src/mcp/tools/api-craft';
import {
  handleCliErgonomicsCraft,
  handleCliErgonomicsCraftFinalize,
} from '../../../src/mcp/tools/cli-ergonomics-craft';
import { handleCodeCraft, handleCodeCraftFinalize } from '../../../src/mcp/tools/code-craft';
import { handleCopyCraft, handleCopyCraftFinalize } from '../../../src/mcp/tools/copy-craft';
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft';
import { handleDocsCraft, handleDocsCraftFinalize } from '../../../src/mcp/tools/docs-craft';
import {
  handleKnowledgeCraft,
  handleKnowledgeCraftFinalize,
} from '../../../src/mcp/tools/knowledge-craft';
import { handleNamingCraft, handleNamingCraftFinalize } from '../../../src/mcp/tools/naming-craft';
import {
  handleSecurityCraft,
  handleSecurityCraftFinalize,
} from '../../../src/mcp/tools/security-craft';
import { handleSpecCraft, handleSpecCraftFinalize } from '../../../src/mcp/tools/spec-craft';
import { handleTestCraft, handleTestCraftFinalize } from '../../../src/mcp/tools/test-craft';

type Response = { content: Array<{ type: string; text: string }>; isError?: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each tool has its own input type
type Handler = (input: any) => Promise<Response>;

interface TwoStepTool {
  name: string;
  run: Handler;
  finalize: Handler;
  /** Extra input that keeps the run deterministic and offline. */
  extra?: Record<string, unknown>;
  /** Writes one real fixture the tool critiques; returns its project-relative path. */
  seed: (dir: string) => string;
}

function write(dir: string, rel: string, content: string): string {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return rel;
}

const SUBSTANTIVE_FN = `export function classify(x) {
  if (x > 10) {
    return 'big';
  }
  const doubled = x * 2;
  return doubled > 5 ? 'medium' : 'small';
}
`;

const TWO_STEP: TwoStepTool[] = [
  {
    name: 'api_craft',
    run: handleApiCraft,
    finalize: handleApiCraftFinalize,
    seed: (d) =>
      write(
        d,
        'src/routes/widgets.ts',
        "router.post('/widgets', async (req, res) => { res.json({}); });"
      ),
  },
  {
    name: 'cli_ergonomics_craft',
    run: handleCliErgonomicsCraft,
    finalize: handleCliErgonomicsCraftFinalize,
    seed: (d) =>
      write(
        d,
        'src/commands/build.ts',
        "new Command('build').option('--out <f>').action(async () => {});"
      ),
  },
  {
    name: 'code_craft',
    run: handleCodeCraft,
    finalize: handleCodeCraftFinalize,
    seed: (d) => write(d, 'src/classify.ts', SUBSTANTIVE_FN),
  },
  {
    name: 'copy_craft',
    run: handleCopyCraft,
    finalize: handleCopyCraftFinalize,
    extra: { surfaces: ['error'] },
    seed: (d) =>
      write(d, 'src/parse.ts', 'export function parse() {\n  throw new Error("parse error");\n}\n'),
  },
  {
    name: 'docs_craft',
    run: handleDocsCraft,
    finalize: handleDocsCraftFinalize,
    seed: (d) => write(d, 'docs/guides/intro.md', '# Intro\n\nThe system supports X, Y, and Z.\n'),
  },
  {
    name: 'knowledge_craft',
    run: handleKnowledgeCraft,
    finalize: handleKnowledgeCraftFinalize,
    seed: (d) =>
      write(
        d,
        'docs/knowledge/auth/email-validator.md',
        '# Email Validator\n\nThe user service validates emails via the EmailValidator class.\n'
      ),
  },
  {
    name: 'naming_craft',
    run: handleNamingCraft,
    finalize: handleNamingCraftFinalize,
    seed: (d) => write(d, 'src.ts', 'export const foo = 1;\n'),
  },
  {
    name: 'security_craft',
    run: handleSecurityCraft,
    finalize: handleSecurityCraftFinalize,
    seed: (d) =>
      write(
        d,
        'packages/api/src/run.ts',
        "import * as child_process from 'child_process';\n" +
          'export function run(req, res) {\n' +
          '  child_process.exec(req.body.cmd, () => res.json({}));\n}\n'
      ),
  },
  {
    name: 'spec_craft',
    run: handleSpecCraft,
    finalize: handleSpecCraftFinalize,
    seed: (d) =>
      write(
        d,
        'docs/changes/feature-x/proposal.md',
        '# Feature X\n\n## Decisions\n\nVague decision that does not explain the trade-offs considered.\n'
      ),
  },
  {
    name: 'test_craft',
    run: handleTestCraft,
    finalize: handleTestCraftFinalize,
    seed: (d) =>
      write(
        d,
        'foo.test.ts',
        "import { describe, it, expect } from 'vitest';\n\n" +
          "describe('classify', () => {\n  it('returns big for large input', () => {\n" +
          "    expect(classify(20)).toBe('big');\n  });\n});\n"
      ),
  },
];

/** Every craft MCP tool, including design_craft (single-step, no `mode: in-session`). */
const ALL: Array<{ name: string; run: Handler; extra?: Record<string, unknown> }> = [
  ...TWO_STEP,
  { name: 'design_craft', run: handleDesignCraft as Handler },
];

const MODES = ['in-session', 'inline'] as const;

function inputFor(
  tool: { name: string; extra?: Record<string, unknown> },
  p: string,
  mode: string
) {
  // design_craft's `mode` is fast|deep; the in-session/inline axis does not apply to it.
  return tool.name === 'design_craft' ? { path: p } : { path: p, mode, ...tool.extra };
}

function text(r: Response): string {
  return r.content[0]?.text ?? '';
}

describe('craft MCP tools: path guard and zero-candidate abstention (#2625)', () => {
  let tmpDir: string;
  let savedEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-scope-'));
    savedEnv = process.env.HARNESS_CRAFT_LLM;
    process.env.HARNESS_CRAFT_LLM = 'mock';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env.HARNESS_CRAFT_LLM;
    else process.env.HARNESS_CRAFT_LLM = savedEnv;
  });

  describe.each(ALL)('$name', (tool) => {
    it.each(MODES)('a nonexistent path is an error, and is not created (mode %s)', async (mode) => {
      const missing = path.join(tmpDir, 'does-not-exist');
      const r = await tool.run(inputFor(tool, missing, mode));
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('does not exist');
      expect(text(r)).toContain(tool.name);
      expect(fs.existsSync(missing)).toBe(false);
    });

    it.each(MODES)('a path that is a file is an error (mode %s)', async (mode) => {
      const file = path.join(tmpDir, 'a-file.ts');
      fs.writeFileSync(file, 'export const x = 1;\n');
      const r = await tool.run(inputFor(tool, file, mode));
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('is not a directory');
    });
  });

  describe.each(TWO_STEP)('$name over an existing empty directory', (tool) => {
    it('in-session collect abstains instead of reporting an empty clean collection', async () => {
      const r = await tool.run(inputFor(tool, tmpDir, 'in-session'));
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(text(r));
      expect(out.pendingPrompts).toEqual([]);
      expect(out.abstention?.reason).toBe('no-candidate-files');
    });

    it('finalize of that collection carries the abstention on its summary', async () => {
      const collected = JSON.parse(text(await tool.run(inputFor(tool, tmpDir, 'in-session'))));
      const r = await tool.finalize({ path: tmpDir, runId: collected.runId, responses: [] });
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(text(r));
      expect(out.findings).toEqual([]);
      expect(out.summary.abstention?.reason).toBe('no-candidate-files');
    });

    it('inline run abstains on its summary', async () => {
      const r = await tool.run(inputFor(tool, tmpDir, 'inline'));
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(text(r));
      expect(out.findings).toEqual([]);
      expect(out.summary.abstention?.reason).toBe('no-candidate-files');
    });

    // POSITIVE CONTROL: the guard and the abstention must not fire on a scope
    // that holds a real candidate. Without this, "isError on everything" and
    // "always abstain" would satisfy the tests above.
    it('still collects prompts, with no abstention, over a real fixture file', async () => {
      tool.seed(tmpDir);
      const r = await tool.run(inputFor(tool, tmpDir, 'in-session'));
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(text(r));
      expect(out.pendingPrompts.length).toBeGreaterThan(0);
      expect(out.abstention).toBeUndefined();

      const inline = JSON.parse(text(await tool.run(inputFor(tool, tmpDir, 'inline'))));
      expect(inline.summary.abstention).toBeUndefined();
    });
  });

  describe('design_craft over an existing directory', () => {
    it('abstains when it was given nothing to critique', async () => {
      const r = await handleDesignCraft({ path: tmpDir });
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(text(r));
      expect(out.findings).toEqual([]);
      expect(out.summary.abstention?.reason).toBe('no-candidate-files');
    });

    it('still critiques a real fixture file, with no abstention (positive control)', async () => {
      const file = path.join(tmpDir, write(tmpDir, 'Button.tsx', 'export const B = () => <b/>;\n'));
      const r = await handleDesignCraft({ path: tmpDir, files: [file], phases: ['critique'] });
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(text(r));
      expect(out.findings.length).toBeGreaterThan(0);
      expect(out.summary.abstention).toBeUndefined();
    });
  });
});
