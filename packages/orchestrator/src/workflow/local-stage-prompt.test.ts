import { describe, it, expect } from 'vitest';
import {
  selectStagePromptTemplate,
  LOCAL_STAGE_PROMPT_TEMPLATE,
  stagePersonaSystemPrompt,
} from './local-stage-prompt';
import { STAGE_PROMPT_TEMPLATE, deriveVerifyCommands } from './orchestrator-context';
import { PromptRenderer } from '../prompt/renderer';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The full variable bag the renderStagePrompt seam supplies (strictVariables). */
const RENDER_BAG = {
  stageNumber: 1,
  identifier: 'ISS-1',
  title: 'Do the thing',
  description: 'details',
  skill: 'harness-execution',
  cognitiveMode: '',
  produces: 'artifact.md',
  documentPath: '',
  reviewStage: '',
  priorEntries: [] as Array<{ name: string; output: string }>,
  verifyCommands: [
    'pnpm --filter <changed-package-name> typecheck',
    'pnpm --filter <changed-package-name> lint',
    'pnpm --filter <changed-package-name> test',
  ] as string[],
};

/**
 * SC-LOCAL: the local-aware stage-prompt selector picks the local-indirection
 * template for local-endpoint backends and the byte-identical default template
 * otherwise (SC3 graceful degradation).
 */
describe('selectStagePromptTemplate (SC-LOCAL)', () => {
  it('returns the LOCAL template for a local backend', () => {
    expect(selectStagePromptTemplate(true)).toBe(LOCAL_STAGE_PROMPT_TEMPLATE);
  });

  it('returns the byte-identical default STAGE_PROMPT_TEMPLATE for a non-local backend (SC3)', () => {
    expect(selectStagePromptTemplate(false)).toBe(STAGE_PROMPT_TEMPLATE);
  });
});

describe('LOCAL_STAGE_PROMPT_TEMPLATE', () => {
  it('uses the harness skill run --autonomous indirection over the {{ skill }} variable', () => {
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('harness skill run');
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('--autonomous');
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('{{ skill }}');
  });

  it('references the same variable set as the default template (no new required var)', () => {
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('{{ stageNumber }}');
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('{{ identifier }}');
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('{{ title }}');
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('priorEntries');
  });

  it('instructs the model to self-verify (typecheck + lint + full test suite) before finishing', () => {
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('self-verify');
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('typecheck');
    // must call out the two gate-failure modes the retry loop kept hitting
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toMatch(/esbuild.*strips types|ALWAYS run typecheck/);
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toMatch(/count|inventory/);
  });

  it('frames comprehension units as the agent primary understanding', () => {
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain(
      'comprehension units are your primary understanding'
    );
  });
});

describe('stage-prompt templates thread the produces variable (SC5)', () => {
  it('BOTH templates reference {{ produces }} (shared variable set / strictVariables parity)', () => {
    expect(STAGE_PROMPT_TEMPLATE).toContain('{{ produces }}');
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('{{ produces }}');
  });

  it('the default template renders under strictVariables with the produces variable present', async () => {
    const renderer = new PromptRenderer();
    await expect(renderer.render(STAGE_PROMPT_TEMPLATE, RENDER_BAG)).resolves.toContain(
      'artifact.md'
    );
  });

  it('the LOCAL template renders under strictVariables with the produces variable present', async () => {
    const renderer = new PromptRenderer();
    await expect(renderer.render(LOCAL_STAGE_PROMPT_TEMPLATE, RENDER_BAG)).resolves.toContain(
      'artifact.md'
    );
  });

  it('a VERIFY stage does not tell the model to invoke outcome_eval (the orchestrator gate runs it)', async () => {
    // outcome_eval moved from a model instruction (unworkable — codex cannot call
    // MCP tools, it shell-execs the name) to a deterministic orchestrator gate step.
    // The verify prompt must NOT tell the model to run it.
    const renderer = new PromptRenderer();
    const rendered = await renderer.render(LOCAL_STAGE_PROMPT_TEMPLATE, {
      ...RENDER_BAG,
      produces: 'verify',
      reviewStage: 'verify',
    });
    expect(rendered).not.toContain('NOT_SATISFIED');
    expect(rendered).toContain('orchestrator independently runs');
  });
});

describe('LOCAL_STAGE_PROMPT_TEMPLATE drives completion, not "run then stop" (D5/SC5)', () => {
  it('drives the model to PRODUCE the declared output', () => {
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('PRODUCE');
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('{{ produces }}');
  });

  it('no longer instructs "then stop" as the terminal action after merely reading', () => {
    // The old wording ("Complete THIS stage's task, then stop." / "follow its
    // output VERBATIM") let a local model stop after reading the skill's
    // instructions without doing the work. The drive wording must not tell the
    // model to stop before producing its output.
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).not.toContain('then stop.');
  });

  it('keeps the prior-stage <<<BEGIN>>>/<<<END>>> data-fencing BYTE-IDENTICAL', () => {
    // These exact substrings must survive verbatim so prior-artifact injection is
    // still treated as DATA, not as instructions (prompt-injection guard).
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain(
      '<<<BEGIN {{ entry.name }}>>>\n{{ entry.output }}'
    );
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('{{ entry.output }}\n<<<END {{ entry.name }}>>>');
  });

  it('keeps the harness skill run --autonomous bash block and the /harness:X redirect intact', () => {
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain(
      'harness skill run {{ skill }} --autonomous --path .'
    );
    expect(LOCAL_STAGE_PROMPT_TEMPLATE).toContain('harness skill run harness-X --autonomous');
  });
});

describe('stagePersonaSystemPrompt — per-stage persona (local subagent-delegation analog)', () => {
  it('gives design stages a no-code author/planner persona', () => {
    expect(stagePersonaSystemPrompt('harness-brainstorming')).toMatch(/specification author/i);
    expect(stagePersonaSystemPrompt('harness-brainstorming')).toMatch(/do NOT write/i);
    expect(stagePersonaSystemPrompt('harness-planning')).toMatch(/planner/i);
    expect(stagePersonaSystemPrompt('harness-planning')).toMatch(/do NOT write/i);
  });

  it('gives the verify stage an INDEPENDENT auditor persona that does not fix code', () => {
    const p = stagePersonaSystemPrompt('harness-verification');
    expect(p).toMatch(/independent verifier/i);
    expect(p).toMatch(/do NOT fix, write, or commit/i);
  });

  it('gives the review stage an adversarial reviewer persona that commits nothing', () => {
    const p = stagePersonaSystemPrompt('harness-code-review');
    expect(p).toMatch(/adversarial code reviewer/i);
    expect(p).toMatch(/do NOT modify code or commit/i);
  });

  it('gives the execution stage a senior-engineer persona that self-verifies', () => {
    const p = stagePersonaSystemPrompt('harness-execution');
    expect(p).toMatch(/senior software engineer/i);
    expect(p).toMatch(/self-verify/i);
  });

  it('returns undefined for an unknown skill (SC3 → backend default system prompt)', () => {
    expect(stagePersonaSystemPrompt('some-unknown-skill')).toBeUndefined();
  });
});

describe('LOCAL template — document vs code stage (true-autopilot artifacts)', () => {
  const renderer = new PromptRenderer();

  it('a DOCUMENT stage (documentPath set) instructs writing markdown to the EXACT path, not code', async () => {
    const out = await renderer.render(LOCAL_STAGE_PROMPT_TEMPLATE, {
      ...RENDER_BAG,
      skill: 'harness-brainstorming',
      produces: 'spec',
      documentPath: 'docs/changes/my-item/proposal.md',
    });
    expect(out).toContain('produces a DOCUMENT');
    expect(out).toContain('docs/changes/my-item/proposal.md');
    expect(out).toContain('do NOT put it in `tmp/`');
    expect(out).toContain('do NOT write code');
    expect(out).not.toContain('self-verify');
  });

  it('a REVIEW stage (reviewStage set) runs tools and commits NOTHING (no review.md)', async () => {
    const out = await renderer.render(LOCAL_STAGE_PROMPT_TEMPLATE, {
      ...RENDER_BAG,
      skill: 'harness-code-review',
      produces: 'review',
      reviewStage: 'review',
    });
    expect(out).toContain('REVIEW/CHECK');
    expect(out).toContain('run_code_review');
    expect(out).toContain('no `review.md`');
    expect(out).not.toContain('produces a DOCUMENT');
    expect(out).not.toContain('self-verify');
  });

  it('a CODE stage (both flags empty) keeps the self-verify block and no document/review instruction', async () => {
    const out = await renderer.render(LOCAL_STAGE_PROMPT_TEMPLATE, {
      ...RENDER_BAG,
      skill: 'harness-execution',
      produces: 'impl',
      documentPath: '',
      reviewStage: '',
    });
    expect(out).toContain('self-verify');
    expect(out).not.toContain('produces a DOCUMENT');
    expect(out).not.toContain('REVIEW/CHECK');
  });
});

describe('LOCAL self-verify block is ecosystem-aware (proposal SC1-SC3)', () => {
  const renderer = new PromptRenderer();

  const SCOPED_PNPM_FALLBACK = [
    'pnpm --filter <changed-package-name> typecheck',
    'pnpm --filter <changed-package-name> lint',
    'pnpm --filter <changed-package-name> test',
  ];

  function mkWorkspace(markers: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-'));
    for (const m of markers) fs.writeFileSync(path.join(dir, m), '');
    return dir;
  }

  // SC1: non-node ecosystem → that toolchain's commands, NO pnpm --filter
  it('renders the detected non-node ecosystem commands and no pnpm --filter line', async () => {
    const dir = mkWorkspace(['Cargo.toml']);
    const verifyCommands = deriveVerifyCommands(dir);
    expect(verifyCommands).toEqual(['cargo build', 'cargo test']);
    const out = await renderer.render(LOCAL_STAGE_PROMPT_TEMPLATE, {
      ...RENDER_BAG,
      produces: 'impl',
      documentPath: '',
      reviewStage: '',
      verifyCommands,
    });
    expect(out).toContain('cargo build');
    expect(out).toContain('cargo test');
    expect(out).not.toContain('pnpm --filter');
    // Lock the multi-command newline joining directly on the non-node path (not
    // just transitively via the pnpm-fallback parity test): each command emits
    // `cmd\n`, so the block is newline-separated inside the ```bash fence.
    expect(out).toContain('```bash\ncargo build\ncargo test\n```');
  });

  // SC2a: node workspace → byte-identical scoped pnpm fallback
  it('falls back to the scoped pnpm prose on a node workspace', () => {
    const dir = mkWorkspace(['pnpm-lock.yaml']);
    expect(deriveVerifyCommands(dir)).toEqual(SCOPED_PNPM_FALLBACK);
  });

  // SC2b: unrecognized / unreadable workspace → same scoped pnpm fallback
  it('falls back to the scoped pnpm prose when no ecosystem is detected', () => {
    const empty = mkWorkspace([]);
    expect(deriveVerifyCommands(empty)).toEqual(SCOPED_PNPM_FALLBACK);
    expect(deriveVerifyCommands(path.join(empty, 'does-not-exist'))).toEqual(SCOPED_PNPM_FALLBACK);
  });

  // SC2 (render parity): the fallback bag renders the exact pre-change block
  it('renders the byte-identical scoped pnpm block for the fallback command set', async () => {
    const out = await renderer.render(LOCAL_STAGE_PROMPT_TEMPLATE, {
      ...RENDER_BAG,
      produces: 'impl',
      documentPath: '',
      reviewStage: '',
      verifyCommands: SCOPED_PNPM_FALLBACK,
    });
    expect(out).toContain(
      'pnpm --filter <changed-package-name> typecheck\n' +
        'pnpm --filter <changed-package-name> lint\n' +
        'pnpm --filter <changed-package-name> test\n'
    );
  });

  // SC3: default (cloud) template never references verifyCommands and renders
  // under strictVariables WITHOUT it in the bag.
  it('leaves the default template independent of verifyCommands (strictVariables safe)', async () => {
    expect(STAGE_PROMPT_TEMPLATE).not.toContain('verifyCommands');
    const { verifyCommands: _omit, ...bagWithoutVerify } = RENDER_BAG;
    await expect(renderer.render(STAGE_PROMPT_TEMPLATE, bagWithoutVerify)).resolves.toContain(
      'artifact.md'
    );
  });
});
