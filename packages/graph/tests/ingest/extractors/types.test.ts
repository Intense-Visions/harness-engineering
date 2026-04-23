import { describe, it, expect } from 'vitest';
import type {
  ExtractionRecord,
  SignalExtractor,
  Language,
} from '../../../src/ingest/extractors/types.js';

describe('ExtractionRecord', () => {
  it('should accept a well-formed record', () => {
    const record: ExtractionRecord = {
      id: 'extracted:test-descriptions:a1b2c3d4',
      extractor: 'test-descriptions',
      language: 'typescript',
      filePath: 'src/auth/auth.service.test.ts',
      line: 42,
      nodeType: 'business_rule',
      name: 'should reject expired tokens',
      content: "describe('AuthService') > it('should reject expired tokens')",
      confidence: 0.7,
      metadata: { suite: 'AuthService', framework: 'vitest' },
    };

    expect(record.id).toBe('extracted:test-descriptions:a1b2c3d4');
    expect(record.extractor).toBe('test-descriptions');
    expect(record.language).toBe('typescript');
    expect(record.nodeType).toBe('business_rule');
    expect(record.confidence).toBeGreaterThanOrEqual(0);
    expect(record.confidence).toBeLessThanOrEqual(1);
  });
});

describe('SignalExtractor interface', () => {
  it('should be implementable', () => {
    const extractor: SignalExtractor = {
      name: 'test-extractor',
      supportedExtensions: ['.ts', '.js'],
      extract(_content: string, _filePath: string, _language: Language): ExtractionRecord[] {
        return [];
      },
    };

    expect(extractor.name).toBe('test-extractor');
    expect(extractor.supportedExtensions).toContain('.ts');
    expect(extractor.extract('', 'test.ts', 'typescript')).toEqual([]);
  });
});

describe('Language type', () => {
  it('should accept all 6 supported languages', () => {
    const languages: Language[] = ['typescript', 'javascript', 'python', 'go', 'rust', 'java'];
    expect(languages).toHaveLength(6);
  });
});
