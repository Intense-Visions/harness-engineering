import { describe, it, expect } from 'vitest';
import { normalizeName } from '../../src/slash-commands/normalize-name';

describe('normalizeName', () => {
  it('strips leading harness- prefix', () => {
    expect(normalizeName('harness-execution')).toBe('execution');
  });

  it('strips leading harness- prefix from multi-word names', () => {
    expect(normalizeName('harness-code-review')).toBe('code-review');
  });

  it('strips interior -harness- from names', () => {
    expect(normalizeName('initialize-harness-project')).toBe('initialize-project');
  });

  it('strips interior -harness- from other names', () => {
    expect(normalizeName('add-harness-component')).toBe('add-component');
  });

  it('passes through names without harness', () => {
    expect(normalizeName('cleanup-dead-code')).toBe('cleanup-dead-code');
  });

  it('passes through single-word names', () => {
    expect(normalizeName('validate')).toBe('validate');
  });

  it('does not strip harness from end position', () => {
    expect(normalizeName('check-harness')).toBe('check');
  });

  it('strips leading harness- prefix from roadmap skill', () => {
    expect(normalizeName('harness-roadmap')).toBe('roadmap');
  });

  it('handles name that is just "harness"', () => {
    expect(normalizeName('harness')).toBe('harness');
  });
});
