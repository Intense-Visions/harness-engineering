import { describe, it, expect } from 'vitest';
import { resolveStability } from '../../src/caching/stability';

describe('resolveStability', () => {
  describe('graph node types (PascalCase)', () => {
    it('returns session for File', () => {
      expect(resolveStability('File')).toBe('session');
    });

    it('returns session for Function', () => {
      expect(resolveStability('Function')).toBe('session');
    });

    it('returns session for Class', () => {
      expect(resolveStability('Class')).toBe('session');
    });

    it('returns session for Constraint', () => {
      expect(resolveStability('Constraint')).toBe('session');
    });

    it('returns session for PackedSummary', () => {
      expect(resolveStability('PackedSummary')).toBe('session');
    });

    it('returns static for SkillDefinition', () => {
      expect(resolveStability('SkillDefinition')).toBe('static');
    });

    it('returns static for ToolDefinition', () => {
      expect(resolveStability('ToolDefinition')).toBe('static');
    });
  });

  describe('lowercase content types (graph NodeType values)', () => {
    it('returns session for file', () => {
      expect(resolveStability('file')).toBe('session');
    });

    it('returns session for function', () => {
      expect(resolveStability('function')).toBe('session');
    });

    it('returns session for class', () => {
      expect(resolveStability('class')).toBe('session');
    });

    it('returns session for constraint', () => {
      expect(resolveStability('constraint')).toBe('session');
    });

    it('returns session for packed_summary', () => {
      expect(resolveStability('packed_summary')).toBe('session');
    });

    it('returns static for skill', () => {
      expect(resolveStability('skill')).toBe('static');
    });
  });

  describe('default behavior', () => {
    it('returns ephemeral for unknown types', () => {
      expect(resolveStability('unknown_thing')).toBe('ephemeral');
    });

    it('returns ephemeral for empty string', () => {
      expect(resolveStability('')).toBe('ephemeral');
    });
  });
});
