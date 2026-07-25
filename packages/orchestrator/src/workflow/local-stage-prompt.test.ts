import { describe, it, expect } from 'vitest';
import {
  selectStagePromptTemplate,
  LOCAL_STAGE_PROMPT_TEMPLATE,
  stagePersonaSystemPrompt,
} from './local-stage-prompt';
import { STAGE_PROMPT_TEMPLATE } from './orchestrator-context';
import { PromptRenderer } from '../prompt/renderer';

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
