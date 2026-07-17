import { describe, it, expect } from 'vitest';
import { selectStagePromptTemplate, LOCAL_STAGE_PROMPT_TEMPLATE } from './local-stage-prompt';
import { STAGE_PROMPT_TEMPLATE } from './orchestrator-context';

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
