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

  // capwell#1372: the value must run to the *matching* close quote. A class
  // excluding both quote types truncates at the first inner quote, and the
  // fragment left behind (`$(sed -n `, `${TOKEN#\`) no longer parses as a
  // reference — so `isReferenceOnlySecretValue` reads it as a literal and the
  // line is reported as a hardcoded secret.
  it('keeps the opposite quote type inside the value', () => {
    expect(extractQuotedSecretValue(`TOKEN="$(sed -n 's/^TOKEN=//p' .env)"`)).toBe(
      `$(sed -n 's/^TOKEN=//p' .env)`
    );
  });

  it('keeps an escaped quote inside the value', () => {
    expect(extractQuotedSecretValue('TOKEN="${TOKEN#\\"}"')).toBe('${TOKEN#\\"}');
  });

  it('extracts values that survive as reference-only end to end', () => {
    const value = extractQuotedSecretValue(`TOKEN="$(sed -n 's/^TOKEN=//p' .env)"`);
    expect(value).not.toBeNull();
    expect(isReferenceOnlySecretValue(value as string)).toBe(true);
  });

  it('still treats a literal containing an escaped quote as a literal', () => {
    const value = extractQuotedSecretValue('TOKEN="abc\\"def-sk-live-9999"');
    expect(value).toBe('abc\\"def-sk-live-9999');
    expect(isReferenceOnlySecretValue(value as string)).toBe(false);
  });
});
