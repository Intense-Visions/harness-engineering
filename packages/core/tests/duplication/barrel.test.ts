import { describe, it, expect } from 'vitest';
import { buildCloneIndex, DEFAULT_DUPLICATION_CONFIG } from '@harness-engineering/core';
import type {
  CloneIndex,
  CloneClass,
  CloneMember,
  CloneUnitKind,
  DuplicationConfig,
} from '@harness-engineering/core';

// Criterion 11 says "importable from `@harness-engineering/core`", so this suite
// imports the PACKAGE SPECIFIER, not `../../src/index`. The source barrel would stay
// green through a tsup/export regression that dropped the module from `dist`.
describe('core barrel — duplication surface (criterion 11)', () => {
  it('re-exports buildCloneIndex from the package entry point', () => {
    expect(typeof buildCloneIndex).toBe('function');
    expect(DEFAULT_DUPLICATION_CONFIG.minInstances).toBe(3);
  });

  it('re-exports the CloneClass / CloneMember / CloneIndex / CloneUnitKind types', () => {
    const kind: CloneUnitKind = 'function';
    const member: CloneMember = {
      file: 'src/a.ts',
      unit: 'f',
      kind,
      startLine: 1,
      endLine: 9,
    };
    const cls: CloneClass = {
      fingerprint: '0123456789abcdef',
      tokenCount: 40,
      members: [member],
      rank: 40,
      signal: 'duplicate',
    };
    const index: CloneIndex = {
      classes: [cls],
      byMember: new Map([[`${member.file}:${member.startLine}`, cls]]),
      skipped: [],
      stats: {
        filesScanned: 1,
        filesSkipped: 0,
        unitsFingerprinted: 1,
        unitsBelowMinTokens: 0,
        classesReported: 1,
        classesSuppressed: 0,
        classesTruncated: 0,
      },
    };
    expect(index.byMember.get('src/a.ts:1')).toBe(cls);
  });

  it('re-exports DuplicationConfig with exactly the four specified fields', () => {
    const config: DuplicationConfig = {
      minTokens: 40,
      minInstances: 3,
      ignorePatterns: [],
      maxClasses: 100,
    };
    expect(Object.keys(config).sort()).toEqual([
      'ignorePatterns',
      'maxClasses',
      'minInstances',
      'minTokens',
    ]);
  });
});
