import { describe, it, expect } from 'vitest';
import { selectStagePromptTemplate, LOCAL_STAGE_PROMPT_TEMPLATE } from './local-stage-prompt';
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
});
