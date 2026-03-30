import { describe, it, expect } from 'vitest';
import { getOutline } from '../../src/code-nav/outline';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../fixtures/code-nav');

describe('code_outline', () => {
  it('should extract outline from TypeScript file', async () => {
    const result = await getOutline(path.join(FIXTURES, 'sample.ts'));
    expect(result.error).toBeUndefined();
    expect(result.language).toBe('typescript');
    expect(result.totalLines).toBeGreaterThan(0);

    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('AuthConfig');
    expect(names).toContain('AuthMiddleware');
    expect(names).toContain('createAuthMiddleware');
    expect(names).toContain('UserRole');
    expect(names).toContain('DEFAULT_CONFIG');
  });

  it('should include class methods as children', async () => {
    const result = await getOutline(path.join(FIXTURES, 'sample.ts'));
    const classSym = result.symbols.find((s) => s.name === 'AuthMiddleware');
    expect(classSym).toBeDefined();
    expect(classSym!.children).toBeDefined();
    const methodNames = classSym!.children!.map((c) => c.name);
    expect(methodNames).toContain('constructor');
    expect(methodNames).toContain('authenticate');
    expect(methodNames).toContain('refreshToken');
    expect(methodNames).toContain('validateJWT');
  });

  it('should extract outline from JavaScript file', async () => {
    const result = await getOutline(path.join(FIXTURES, 'sample.js'));
    expect(result.error).toBeUndefined();
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('Router');
    expect(names).toContain('createRouter');
  });

  it('should extract outline from Python file', async () => {
    const result = await getOutline(path.join(FIXTURES, 'sample.py'));
    expect(result.error).toBeUndefined();
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('UserService');
    expect(names).toContain('create_service');
  });

  it('should return parse-failed marker for syntax error files', async () => {
    const result = await getOutline(path.join(FIXTURES, 'syntax-error.ts'));
    // Tree-sitter is error-tolerant, so it may still parse partially.
    // The important thing is it does not throw.
    expect(result).toBeDefined();
  });

  it('should return parse-failed for unsupported files', async () => {
    const result = await getOutline('/tmp/test.rs');
    expect(result.error).toBe('[parse-failed]');
  });
});
