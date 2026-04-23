import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'path';
import { ValidationRuleExtractor } from '../../../src/ingest/extractors/ValidationRuleExtractor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../../__fixtures__/extractor-project');
const extractor = new ValidationRuleExtractor();

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
}

describe('ValidationRuleExtractor', () => {
  it('extracts Zod schemas from TypeScript', () => {
    const content = readFixture('validators.ts');
    const records = extractor.extract(content, 'validators.ts', 'typescript');

    expect(records.length).toBeGreaterThanOrEqual(3);
    expect(records.every((r) => r.nodeType === 'business_rule')).toBe(true);

    const names = records.map((r) => r.name);
    expect(names).toContain('UserSchema');
    expect(names).toContain('OrderSchema');
    expect(names).toContain('AddressSchema');

    const userSchema = records.find((r) => r.name === 'UserSchema');
    expect(userSchema!.confidence).toBe(0.8);
    expect(userSchema!.metadata.framework).toBe('zod');
  });

  it('extracts Pydantic models from Python', () => {
    const content = readFixture('validators.py');
    const records = extractor.extract(content, 'validators.py', 'python');

    expect(records.length).toBeGreaterThanOrEqual(3);

    const names = records.map((r) => r.name);
    expect(names).toContain('UserModel');
    expect(names).toContain('OrderModel');
    expect(names).toContain('AddressModel');

    const userModel = records.find((r) => r.name === 'UserModel');
    expect(userModel!.metadata.framework).toBe('pydantic');
  });

  it('extracts validate struct tags from Go', () => {
    const content = readFixture('validators.go');
    const records = extractor.extract(content, 'validators.go', 'go');

    expect(records.length).toBeGreaterThanOrEqual(3);

    const names = records.map((r) => r.name);
    expect(names).toContain('User');
    expect(names).toContain('Order');
    expect(names).toContain('Address');

    const user = records.find((r) => r.name === 'User');
    expect(user!.metadata.framework).toBe('go-playground/validator');
  });

  it('extracts #[validate] derive macros from Rust', () => {
    const content = readFixture('validators.rs');
    const records = extractor.extract(content, 'validators.rs', 'rust');

    expect(records.length).toBeGreaterThanOrEqual(3);

    const names = records.map((r) => r.name);
    expect(names).toContain('User');
    expect(names).toContain('Order');
    expect(names).toContain('Address');
  });

  it('extracts Bean Validation annotations from Java', () => {
    const content = readFixture('Validators.java');
    const records = extractor.extract(content, 'Validators.java', 'java');

    expect(records.length).toBeGreaterThanOrEqual(2);

    const userRecord = records.find((r) => r.name === 'User');
    expect(userRecord).toBeDefined();
    expect(userRecord!.metadata.framework).toBe('javax.validation');
  });

  it('generates stable IDs', () => {
    const content = readFixture('validators.ts');
    const records1 = extractor.extract(content, 'validators.ts', 'typescript');
    const records2 = extractor.extract(content, 'validators.ts', 'typescript');

    expect(records1.map((r) => r.id)).toEqual(records2.map((r) => r.id));
  });
});
