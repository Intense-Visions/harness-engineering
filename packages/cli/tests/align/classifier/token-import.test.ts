import { describe, it, expect } from 'vitest';
import { findTokenImport } from '../../../src/align/classifier/token-import';

describe('findTokenImport', () => {
  it('recognizes ES named import: import { tokens } from ...', () => {
    const r = findTokenImport(`import { tokens } from '@/design-system/tokens';\nconst x = 1;`);
    expect(r).not.toBeNull();
    expect(r!.identifier).toBe('tokens');
  });

  it('recognizes ES default import: import tokens from ...', () => {
    const r = findTokenImport(`import tokens from './tokens';\n`);
    expect(r).not.toBeNull();
    expect(r!.identifier).toBe('tokens');
  });

  it('recognizes CJS require: const tokens = require(...)', () => {
    const r = findTokenImport(`const tokens = require('./tokens');\n`);
    expect(r).not.toBeNull();
    expect(r!.identifier).toBe('tokens');
  });

  it('returns null when no recognized form is present', () => {
    expect(findTokenImport(`import { Theme } from './theme';\n`)).toBeNull();
  });

  it('does not match a partial token-like name (e.g. `tokensInternal`)', () => {
    expect(findTokenImport(`import tokensInternal from './internal';\n`)).toBeNull();
  });

  it('accepts named import with aliased identifier (import { tokens as t })', () => {
    const r = findTokenImport(`import { tokens as t } from './tokens';\n`);
    expect(r).not.toBeNull();
  });
});
