import { describe, it, expect } from 'vitest';
import {
  extractSpecKeywords,
  detectStackFromDeps,
  inferDomain,
  extractSignals,
  simpleStem,
} from '../../src/skill/signal-extractor.js';

describe('simpleStem', () => {
  it('strips common suffixes', () => {
    expect(simpleStem('testing')).toBe('test');
    expect(simpleStem('authentication')).toBe('authentic');
    expect(simpleStem('responsive')).toBe('respons');
    expect(simpleStem('management')).toBe('manage');
  });

  it('lowercases input', () => {
    expect(simpleStem('Testing')).toBe('test');
  });

  it('returns short words unchanged', () => {
    expect(simpleStem('api')).toBe('api');
    expect(simpleStem('a11y')).toBe('a11y');
  });
});

describe('extractSpecKeywords', () => {
  it('extracts keywords from bold Keywords line', () => {
    const spec = `# My Feature\n\n**Keywords:** auth, session, oauth\n\n## Overview\nSome text.`;
    const result = extractSpecKeywords(spec);
    expect(result).toEqual(['auth', 'session', 'oauth']);
  });

  it('returns empty array when no keywords line', () => {
    const spec = `# My Feature\n\n## Overview\nNo keywords here.`;
    expect(extractSpecKeywords(spec)).toEqual([]);
  });

  it('trims whitespace from keywords', () => {
    const spec = `**Keywords:**  auth ,  session ,  oauth  \n`;
    expect(extractSpecKeywords(spec)).toEqual(['auth', 'session', 'oauth']);
  });

  it('handles keywords with hyphens', () => {
    const spec = `**Keywords:** dark-mode, color-scheme, responsive-design\n`;
    expect(extractSpecKeywords(spec)).toEqual(['dark-mode', 'color-scheme', 'responsive-design']);
  });
});

describe('detectStackFromDeps', () => {
  it('detects react from dependencies', () => {
    const deps = { react: '^18.0.0', 'react-dom': '^18.0.0' };
    const result = detectStackFromDeps(deps, {});
    expect(result).toContain('react');
  });

  it('detects typescript from devDependencies', () => {
    const result = detectStackFromDeps({}, { typescript: '^5.0.0' });
    expect(result).toContain('typescript');
  });

  it('detects next from dependencies', () => {
    const deps = { next: '^14.0.0' };
    const result = detectStackFromDeps(deps, {});
    expect(result).toContain('next');
  });

  it('detects multiple frameworks', () => {
    const deps = { react: '^18.0.0', next: '^14.0.0' };
    const devDeps = { typescript: '^5.0.0', tailwindcss: '^3.0.0' };
    const result = detectStackFromDeps(deps, devDeps);
    expect(result).toContain('react');
    expect(result).toContain('next');
    expect(result).toContain('typescript');
    expect(result).toContain('tailwind');
  });

  it('returns empty array for empty deps', () => {
    expect(detectStackFromDeps({}, {})).toEqual([]);
  });
});

describe('inferDomain', () => {
  it('detects auth domain', () => {
    const spec = '## Authentication\nOAuth2 session token management.';
    expect(inferDomain(spec)).toContain('auth');
  });

  it('detects design domain', () => {
    const spec = '## UI Layout\nResponsive typography and color palette.';
    expect(inferDomain(spec)).toContain('design');
  });

  it('detects data domain', () => {
    const spec = '## Database Schema\nMigration and query optimization.';
    expect(inferDomain(spec)).toContain('data');
  });

  it('detects multiple domains', () => {
    const spec =
      'Build a responsive dashboard with authentication and database query integration. Color theme and OAuth tokens. Schema migration support.';
    const domains = inferDomain(spec);
    expect(domains).toContain('design');
    expect(domains).toContain('auth');
    expect(domains).toContain('data');
  });

  it('returns empty for unrecognized content', () => {
    expect(inferDomain('Just some random text about nothing specific.')).toEqual([]);
  });
});

describe('extractSignals', () => {
  it('combines keywords, stack, and domain into ContentSignals', () => {
    const specText = `# Auth Feature\n\n**Keywords:** auth, oauth, session\n\n## Overview\nAuthentication system with OAuth2.`;
    const deps = { react: '^18.0.0' };
    const devDeps = { typescript: '^5.0.0' };
    const result = extractSignals(specText, deps, devDeps);
    expect(result.specKeywords).toContain('auth');
    expect(result.specKeywords).toContain('oauth');
    expect(result.specText).toBe(specText);
    expect(result.stackSignals).toContain('react');
    expect(result.stackSignals).toContain('typescript');
    expect(result.featureDomain).toContain('auth');
  });

  it('merges contextKeywords from handoff', () => {
    const specText = `**Keywords:** auth\n\nSome spec text.`;
    const result = extractSignals(specText, {}, {}, ['session', 'token']);
    expect(result.specKeywords).toContain('auth');
    expect(result.specKeywords).toContain('session');
    expect(result.specKeywords).toContain('token');
  });

  it('deduplicates keywords', () => {
    const specText = `**Keywords:** auth, session\n\nSome spec text.`;
    const result = extractSignals(specText, {}, {}, ['auth', 'session']);
    const authCount = result.specKeywords.filter((k) => k === 'auth').length;
    expect(authCount).toBe(1);
  });

  it('includes taskText when provided', () => {
    const specText = `**Keywords:** auth\n\nSpec body.`;
    const result = extractSignals(specText, {}, {}, [], 'Implement login form');
    expect(result.taskText).toBe('Implement login form');
  });
});
