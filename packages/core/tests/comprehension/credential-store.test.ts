import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  readPnyonServeToken,
  SERVE_TOKEN_CREDENTIAL_KEY,
} from '../../src/comprehension/credential-store';

// An obviously-fake token — never a real-looking secret literal.
const FAKE_TOKEN = 'pnyon_cst_FAKE_test_only';

/** A read function serving one canned file at `expectedPath`; anything else is "absent". */
function readerFor(
  expectedPath: string,
  contents: string | undefined
): (path: string) => string | undefined {
  return (path: string) => (path === expectedPath ? contents : undefined);
}

describe('readPnyonServeToken (fail-safe global ~/.pnyon/credentials.json reader)', () => {
  const homeDir = '/home/tester';
  const credsPath = join(homeDir, '.pnyon', 'credentials.json');

  it('returns the token from a well-formed credentials.json', () => {
    const readFile = readerFor(
      credsPath,
      JSON.stringify({ [SERVE_TOKEN_CREDENTIAL_KEY]: FAKE_TOKEN })
    );
    expect(readPnyonServeToken({ readFile, homeDir, pnyonHome: '' })).toBe(FAKE_TOKEN);
  });

  it('returns undefined when the file is absent', () => {
    const readFile = (): string | undefined => undefined;
    expect(readPnyonServeToken({ readFile, homeDir, pnyonHome: '' })).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    const readFile = readerFor(credsPath, '{ not: valid json');
    expect(readPnyonServeToken({ readFile, homeDir, pnyonHome: '' })).toBeUndefined();
  });

  it('returns undefined when the JSON is not an object (array / scalar)', () => {
    for (const body of ['[]', '"a-string"', '42', 'null']) {
      const readFile = readerFor(credsPath, body);
      expect(readPnyonServeToken({ readFile, homeDir, pnyonHome: '' })).toBeUndefined();
    }
  });

  it('returns undefined when the serve-token key is missing', () => {
    const readFile = readerFor(credsPath, JSON.stringify({ 'some-other-key': FAKE_TOKEN }));
    expect(readPnyonServeToken({ readFile, homeDir, pnyonHome: '' })).toBeUndefined();
  });

  it('returns undefined when the token is an empty / whitespace string', () => {
    for (const empty of ['', '   ']) {
      const readFile = readerFor(
        credsPath,
        JSON.stringify({ [SERVE_TOKEN_CREDENTIAL_KEY]: empty })
      );
      expect(readPnyonServeToken({ readFile, homeDir, pnyonHome: '' })).toBeUndefined();
    }
  });

  it('returns undefined when the token is a non-string value', () => {
    const readFile = readerFor(credsPath, JSON.stringify({ [SERVE_TOKEN_CREDENTIAL_KEY]: 123 }));
    expect(readPnyonServeToken({ readFile, homeDir, pnyonHome: '' })).toBeUndefined();
  });

  it('returns undefined (never throws) when the injected reader throws', () => {
    const readFile = (): string | undefined => {
      throw new Error('EACCES');
    };
    expect(readPnyonServeToken({ readFile, homeDir, pnyonHome: '' })).toBeUndefined();
  });

  it('honors $PNYON_HOME over the home directory', () => {
    const pnyonHome = '/custom/pnyon-home';
    const readFile = readerFor(
      join(pnyonHome, 'credentials.json'),
      JSON.stringify({ [SERVE_TOKEN_CREDENTIAL_KEY]: FAKE_TOKEN })
    );
    // Same reader returns undefined for the homeDir-derived path, proving PNYON_HOME won.
    expect(readPnyonServeToken({ readFile, homeDir, pnyonHome })).toBe(FAKE_TOKEN);
  });
});
