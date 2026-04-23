import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'path';
import { TestDescriptionExtractor } from '../../../src/ingest/extractors/TestDescriptionExtractor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../../__fixtures__/extractor-project');
const extractor = new TestDescriptionExtractor();

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
}

describe('TestDescriptionExtractor', () => {
  it('extracts describe/it/test from TypeScript', () => {
    const content = readFixture('auth.test.ts');
    const records = extractor.extract(content, 'auth.test.ts', 'typescript');

    expect(records.length).toBeGreaterThanOrEqual(5);
    expect(records.every((r) => r.nodeType === 'business_rule')).toBe(true);
    expect(records.every((r) => r.extractor === 'test-descriptions')).toBe(true);

    const names = records.map((r) => r.name);
    expect(names).toContain('should reject expired tokens');
    expect(names).toContain('should accept valid JWT tokens');
    expect(names).toContain('handles malformed token gracefully');

    // High confidence for string-described tests
    const tokenTest = records.find((r) => r.name === 'should reject expired tokens');
    expect(tokenTest?.confidence).toBe(0.7);
  });

  it('extracts test_ functions from Python', () => {
    const content = readFixture('auth_test.py');
    const records = extractor.extract(content, 'auth_test.py', 'python');

    expect(records.length).toBeGreaterThanOrEqual(4);

    // Docstring-based should have higher confidence
    const expiredTest = records.find((r) => r.content.includes('test_reject_expired_tokens'));
    expect(expiredTest).toBeDefined();
    expect(expiredTest!.confidence).toBe(0.7); // has docstring
  });

  it('extracts Test* and t.Run from Go', () => {
    const content = readFixture('auth_test.go');
    const records = extractor.extract(content, 'auth_test.go', 'go');

    expect(records.length).toBeGreaterThanOrEqual(4);

    // Top-level test function (lower confidence)
    const topLevel = records.find((r) => r.content === 'TestTokenValidation');
    expect(topLevel).toBeDefined();
    expect(topLevel!.confidence).toBe(0.5);

    // Subtests (higher confidence)
    const subtests = records.filter((r) => r.confidence === 0.7);
    expect(subtests.length).toBeGreaterThanOrEqual(2);
    const subtestNames = subtests.map((r) => r.name);
    expect(subtestNames).toContain('rejects expired tokens');
  });

  it('extracts #[test] functions from Rust', () => {
    const content = readFixture('auth_test.rs');
    const records = extractor.extract(content, 'auth_test.rs', 'rust');

    expect(records.length).toBeGreaterThanOrEqual(4);

    // Doc-commented tests should have higher confidence
    const docTest = records.find((r) => r.content === 'test_reject_expired_tokens');
    expect(docTest).toBeDefined();
    expect(docTest!.confidence).toBe(0.7); // has doc comment
  });

  it('extracts @Test/@DisplayName from Java', () => {
    const content = readFixture('AuthTest.java');
    const records = extractor.extract(content, 'AuthTest.java', 'java');

    expect(records.length).toBeGreaterThanOrEqual(3);

    // @DisplayName tests should have higher confidence
    const displayNameTest = records.find((r) => r.name === 'should reject expired tokens');
    expect(displayNameTest).toBeDefined();
    expect(displayNameTest!.confidence).toBe(0.7);

    // Bare @Test should have lower confidence
    const bareTest = records.find((r) => r.name === 'testPasswordHashing');
    expect(bareTest).toBeDefined();
    expect(bareTest!.confidence).toBe(0.5);
  });

  it('generates stable IDs', () => {
    const content = readFixture('auth.test.ts');
    const records1 = extractor.extract(content, 'auth.test.ts', 'typescript');
    const records2 = extractor.extract(content, 'auth.test.ts', 'typescript');

    expect(records1.map((r) => r.id)).toEqual(records2.map((r) => r.id));
  });
});
