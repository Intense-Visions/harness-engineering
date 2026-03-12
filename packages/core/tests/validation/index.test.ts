import { describe, it, expect } from 'vitest';
import {
  validateFileStructure,
  validateConfig,
  validateCommitMessage,
} from '../../src/validation/index';

describe('validation index exports', () => {
  it('should export validateFileStructure function', () => {
    expect(validateFileStructure).toBeDefined();
    expect(typeof validateFileStructure).toBe('function');
  });

  it('should export validateConfig function', () => {
    expect(validateConfig).toBeDefined();
    expect(typeof validateConfig).toBe('function');
  });

  it('should export validateCommitMessage function', () => {
    expect(validateCommitMessage).toBeDefined();
    expect(typeof validateCommitMessage).toBe('function');
  });
});
