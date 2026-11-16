import { describe, it, expect } from 'vitest';
import { SecurityScanner } from '../../src/security/scanner';

/**
 * Code-pattern rules must judge CODE, not prose about code. Each case below is
 * a false positive `harness check-security` reported on this repo's own main
 * (comments naming `__proto__` inside prototype-pollution GUARDS, comments
 * naming `createHash('sha1')`, and a JSON.parse whose result is schema-validated
 * a few lines later). Every negative case is paired with a positive control so
 * a fix that simply stops matching cannot pass.
 */
function ruleIds(content: string, filePath = 'src/example.ts'): string[] {
  const scanner = new SecurityScanner({ enabled: true, strict: false });
  return scanner.scanContent(content, filePath, 1).map((f) => f.ruleId);
}

describe('SecurityScanner — comment context', () => {
  describe('line comments', () => {
    it('does not flag __proto__ named in a // comment', () => {
      const src = [
        '  // Object.hasOwn, not a bare index: a host named `constructor` or',
        '  // `__proto__` would otherwise resolve an INHERITED member.',
        '  if (!Object.hasOwn(MAP, key)) return false;',
      ].join('\n');
      expect(ruleIds(src)).not.toContain('SEC-NODE-001');
    });

    it('positive control: still flags a real __proto__ assignment', () => {
      expect(ruleIds('obj.__proto__ = payload;')).toContain('SEC-NODE-001');
    });

    it('still flags code that precedes a trailing // comment', () => {
      expect(ruleIds("const h = createHash('md5'); // legacy")).toContain('SEC-CRY-001');
    });

    it('does not flag a weak hash named only in a trailing // comment', () => {
      expect(ruleIds("const h = createHash('sha256'); // was createHash('md5')")).not.toContain(
        'SEC-CRY-001'
      );
    });

    it('treats // inside a string literal as code, not a comment opener', () => {
      expect(ruleIds("const u = 'https://x'; obj.__proto__ = p;")).toContain('SEC-NODE-001');
      expect(ruleIds('const u = `http://${host}/a`; obj.__proto__ = p;')).toContain('SEC-NODE-001');
    });

    it('treats // inside a regex literal as part of the regex', () => {
      expect(ruleIds('const re = /https?:\\/\\//; obj.__proto__ = p;')).toContain('SEC-NODE-001');
    });
  });

  describe('block comments', () => {
    it("does not flag createHash('sha1') named inside a JSDoc block", () => {
      const src = [
        '/**',
        ' * normalization or digest stage (or the runtime — a FIPS-mode Node where',
        ' * `createHash(\'sha1\')` throws). Advising "check file permissions" is wrong.',
        ' */',
        'export const x = 1;',
      ].join('\n');
      expect(ruleIds(src)).not.toContain('SEC-CRY-001');
    });

    it('still flags code after a block comment closes on the same line', () => {
      expect(ruleIds("/* legacy */ const h = createHash('md5');")).toContain('SEC-CRY-001');
    });

    it('positive control: still flags a real weak hash in code', () => {
      expect(ruleIds("const h = crypto.createHash('md5').update(x).digest('hex');")).toContain(
        'SEC-CRY-001'
      );
    });
  });

  describe('rules that deliberately scan comments', () => {
    it('still flags a hardcoded secret that sits in a comment', () => {
      expect(ruleIds('// key: AKIAIOSFODNN7EXAMPLE')).toContain('SEC-SEC-001');
    });

    it('still flags a hardcoded encryption key that sits in a comment', () => {
      expect(ruleIds('// encryption_key = "s3cr3t-value-123"')).toContain('SEC-CRY-002');
    });
  });

  describe('non-C-style files keep whole-line matching', () => {
    it('a // in a YAML/markdown file is not treated as a comment', () => {
      // Comment masking is language-aware; a `//` in a non-JS/TS/Go file is
      // ordinary text, so prose there is still scanned as before.
      expect(ruleIds('run: node -e "x // obj.__proto__ = p"', 'ci/workflow.py')).toContain(
        'SEC-NODE-001'
      );
    });
  });
});

describe('SecurityScanner — SEC-DES-001 schema validation context', () => {
  it('does not flag JSON.parse whose result is schema-validated a few lines later', () => {
    const src = [
      'let raw: unknown;',
      'try {',
      '  raw = JSON.parse(payload);',
      '} catch {',
      '  return null;',
      '}',
      'const parsed = FleetClaimSchema.safeParse(raw);',
    ].join('\n');
    expect(ruleIds(src)).not.toContain('SEC-DES-001');
  });

  it('does not flag JSON.parse wrapped directly in a schema parse', () => {
    expect(ruleIds('const v = Schema.parse(JSON.parse(body));')).not.toContain('SEC-DES-001');
  });

  it('positive control: flags JSON.parse with no validation', () => {
    const src = ['const v = JSON.parse(body);', 'return v.items;'].join('\n');
    expect(ruleIds(src)).toContain('SEC-DES-001');
  });

  it('positive control: validating a DIFFERENT variable does not suppress', () => {
    const src = [
      'const raw = JSON.parse(payload);',
      'const other = Schema.safeParse(config);',
      'return raw;',
    ].join('\n');
    expect(ruleIds(src)).toContain('SEC-DES-001');
  });

  it('positive control: validation beyond the lookahead window does not suppress', () => {
    const src = [
      'const raw = JSON.parse(payload);',
      'a();',
      'b();',
      'c();',
      'd();',
      'e();',
      'f();',
      'const parsed = Schema.safeParse(raw);',
    ].join('\n');
    expect(ruleIds(src)).toContain('SEC-DES-001');
  });

  it('a second JSON.parse(raw) is not mistaken for schema validation', () => {
    const src = ['const raw = JSON.parse(payload);', 'const again = JSON.parse(raw);'].join('\n');
    expect(ruleIds(src)).toContain('SEC-DES-001');
  });
});
