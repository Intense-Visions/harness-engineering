import { describe, it, expect } from 'vitest';
import { strength001NonblockingHooks } from './strength-001-nonblocking-hooks';
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

describe('STRENGTH-001 non-blocking hooks', () => {
  it('flags a hook that never blocks (sole exit 0)', () => {
    const findings = strength001NonblockingHooks.detect(
      ctx({
        hookFiles: [
          {
            name: 'pre-commit',
            path: '.husky/pre-commit',
            text: '#!/bin/sh\n# this hook never blocks\nexit 0\n',
          },
        ],
      })
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.id).toBe('STRENGTH-001');
    expect(f.file).toBe('.husky/pre-commit');
    expect(f.line).toBeGreaterThan(0);
    expect(f.message.length).toBeGreaterThan(0);
    expect(f.remediation.length).toBeGreaterThan(0);
    expect('severity' in f).toBe(false);
  });

  it('passes a hook that blocks on failure', () => {
    const findings = strength001NonblockingHooks.detect(
      ctx({
        hookFiles: [
          {
            name: 'pre-commit',
            path: '.husky/pre-commit',
            text: '#!/bin/sh\nnode check.js || exit 1\n',
          },
        ],
      })
    );
    expect(findings).toEqual([]);
  });

  it('passes a hook with `set -e` and a trailing exit 0 (errexit makes failure block)', () => {
    const findings = strength001NonblockingHooks.detect(
      ctx({
        hookFiles: [
          {
            name: 'pre-commit',
            path: '.husky/pre-commit',
            text: '#!/bin/sh\nset -e\nnpm test\nexit 0\n',
          },
        ],
      })
    );
    expect(findings).toEqual([]);
  });

  it('passes a hook with `set -o errexit` and a trailing exit 0', () => {
    const findings = strength001NonblockingHooks.detect(
      ctx({
        hookFiles: [
          {
            name: 'pre-commit',
            path: '.husky/pre-commit',
            text: '#!/bin/sh\nset -o errexit\nnpm test\nexit 0\n',
          },
        ],
      })
    );
    expect(findings).toEqual([]);
  });

  it('flags a sole exit 0 even when the only "if"/"then" appears in a comment', () => {
    // The GATE guard must not be satisfied by the word "if" inside a comment —
    // a comment cannot make a failure path reachable.
    const findings = strength001NonblockingHooks.detect(
      ctx({
        hookFiles: [
          {
            name: 'pre-commit',
            path: '.husky/pre-commit',
            text: '#!/bin/sh\n# run checks then exit, even if they fail\nnpm test\nexit 0\n',
          },
        ],
      })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe('STRENGTH-001');
  });

  it('is not evaluable when there are no hook files', () => {
    const c = ctx({ hookFiles: [] });
    expect(strength001NonblockingHooks.evaluable?.(c)).toBe(false);
    expect(strength001NonblockingHooks.detect(c)).toEqual([]);
  });

  it('applies in both modes', () => {
    expect(strength001NonblockingHooks.appliesIn('adopter')).toBe(true);
    expect(strength001NonblockingHooks.appliesIn('toolkit')).toBe(true);
  });
});
