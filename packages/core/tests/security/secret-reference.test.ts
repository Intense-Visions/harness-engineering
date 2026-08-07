import { describe, it, expect } from 'vitest';
import {
  isReferenceOnlySecretValue,
  extractQuotedSecretValue,
} from '../../src/security/secret-reference';

describe('isReferenceOnlySecretValue', () => {
  it.each([
    ['$AUTOAPPROVE_PAT', 'shell bare var'],
    ['${DEPLOY_API_KEY}', 'shell brace var'],
    ['${NAME:-default}', 'shell brace var with default'],
    ['${{ secrets.BASELINE_AUTOAPPROVE_PAT }}', 'CI secrets expression'],
    ['${{ env.MY_ENV }}', 'CI env expression'],
    ['${{ vars.MY_VAR }}', 'CI vars expression'],
    ['${{ secrets.A }}-${{ secrets.B }}', 'two CI expressions joined by punctuation'],
    ['  $TOKEN  ', 'reference with surrounding whitespace'],
    ['$(gh auth token)', 'command substitution'],
    ['$( aws secretsmanager get-secret-value )', 'command substitution with spaces'],
    ['`gh auth token`', 'backtick command substitution'],
    ['$(gh auth token) ${FALLBACK}', 'command substitution + brace ref'],
    ['$(echo sk-ant-live-hidden)', 'literal inside command substitution (documented boundary)'],
  ])('treats %s (%s) as reference-only', (value) => {
    expect(isReferenceOnlySecretValue(value)).toBe(true);
  });

  it.each([
    ['sk-ant-api03-REALLOOKINGKEY0123456789abcdef', 'literal API key'],
    ['hunter2hunter2', 'literal password'],
    ['${PREFIX}sk-live-abc123', 'partial: reference + literal residue'],
    ['prefix-${VAR}', 'partial: literal prefix + reference'],
    ['$(id)-sk-ant-literalsuffix', 'partial: command substitution + literal residue'],
    ['$(a $(b))', 'nested command substitution stays flagged (conservative)'],
    ['', 'empty string'],
    ['   ', 'whitespace only'],
  ])('treats %s (%s) as NOT reference-only', (value) => {
    expect(isReferenceOnlySecretValue(value)).toBe(false);
  });
});

describe('extractQuotedSecretValue', () => {
  it('extracts a double-quoted value', () => {
    expect(extractQuotedSecretValue('TOKEN="$AUTOAPPROVE_PAT"')).toBe('$AUTOAPPROVE_PAT');
  });

  it('extracts a single-quoted value', () => {
    expect(extractQuotedSecretValue("API_KEY='sk-live-abc'")).toBe('sk-live-abc');
  });

  it('returns null when the match carries no quoted value', () => {
    expect(extractQuotedSecretValue('postgres://user:pass@host')).toBeNull();
  });
});
