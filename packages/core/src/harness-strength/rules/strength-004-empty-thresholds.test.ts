import { describe, it, expect } from 'vitest';
import { strength004EmptyThresholds } from './strength-004-empty-thresholds';
import type { ProjectContext } from '../types';

function ctx(partial: Partial<ProjectContext>): ProjectContext {
  return {
    root: '/r',
    mode: 'adopter',
    config: null,
    preCommit: null,
    hookFiles: [],
    workflows: [],
    healthSnapshot: null,
    ...partial,
  };
}

describe('STRENGTH-004 empty architecture.thresholds', () => {
  it('flags an adopter config with layers but empty thresholds', () => {
    const findings = strength004EmptyThresholds.detect(
      ctx({ config: { layers: [{}], architecture: { thresholds: {} } } })
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.id).toBe('STRENGTH-004');
    expect(f.file).toBe('harness.config.json');
    expect('severity' in f).toBe(false);
  });

  it('flags an adopter config with layers but thresholds undefined', () => {
    const findings = strength004EmptyThresholds.detect(ctx({ config: { layers: [{}] } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('harness.config.json');
  });

  it('passes when thresholds are configured', () => {
    expect(
      strength004EmptyThresholds.detect(
        ctx({ config: { layers: [{}], architecture: { thresholds: { maxFanOut: 10 } } } })
      )
    ).toEqual([]);
  });

  it('passes when there are no layers (nothing to constrain)', () => {
    expect(strength004EmptyThresholds.detect(ctx({ config: { layers: [] } }))).toEqual([]);
  });

  it('flags a toolkit template with layers and empty thresholds', () => {
    const findings = strength004EmptyThresholds.detect(
      ctx({
        mode: 'toolkit',
        config: null,
        templates: [
          {
            path: 'templates/basic/harness.config.json.hbs',
            text: '{"layers":[{}],"architecture":{"thresholds":{}}}',
          },
        ],
      })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('templates/basic/harness.config.json.hbs');
  });

  it('skips a toolkit template that does not parse as JSON', () => {
    const findings = strength004EmptyThresholds.detect(
      ctx({
        mode: 'toolkit',
        config: null,
        templates: [
          {
            path: 'templates/basic/harness.config.json.hbs',
            text: '{"layers":[{{#each x}}{}{{/each}}],"architecture":{"thresholds":{}}}',
          },
        ],
      })
    );
    expect(findings).toEqual([]);
  });

  it('is not evaluable when config is null and there are no templates', () => {
    const c = ctx({ config: null });
    expect(strength004EmptyThresholds.evaluable?.(c)).toBe(false);
    expect(strength004EmptyThresholds.detect(c)).toEqual([]);
  });
});
