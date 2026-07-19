import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AnalysisConfigSchema, loadAnalysisExclude } from '../../src/config/analysis-schema';
import { HarnessConfigSchema } from '../../src/config/schema';

describe('AnalysisConfigSchema', () => {
  it('parses an exclude glob list', () => {
    const result = AnalysisConfigSchema.safeParse({
      exclude: ['**/vendored/**', 'legacy/**'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exclude).toEqual(['**/vendored/**', 'legacy/**']);
    }
  });

  it('defaults exclude to an empty list', () => {
    const result = AnalysisConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.exclude).toEqual([]);
  });

  it('rejects empty-string patterns', () => {
    expect(AnalysisConfigSchema.safeParse({ exclude: [''] }).success).toBe(false);
  });

  it('rejects non-array exclude', () => {
    expect(AnalysisConfigSchema.safeParse({ exclude: '**/vendored/**' }).success).toBe(false);
  });

  it('is accepted as an optional top-level block by HarnessConfigSchema', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      analysis: { exclude: ['**/generated/**'] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.analysis?.exclude).toEqual(['**/generated/**']);
    }
  });
});

describe('loadAnalysisExclude', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-exclude-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(content: string): void {
    fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), content);
  }

  it('returns the exclude globs from a valid config', () => {
    writeConfig(JSON.stringify({ version: 1, analysis: { exclude: ['**/vendored/**'] } }));
    expect(loadAnalysisExclude(tmpDir)).toEqual(['**/vendored/**']);
  });

  it('returns [] when no config file exists', () => {
    expect(loadAnalysisExclude(tmpDir)).toEqual([]);
  });

  it('returns [] when the config is malformed JSON', () => {
    writeConfig('{ not json');
    expect(loadAnalysisExclude(tmpDir)).toEqual([]);
  });

  it('returns [] when there is no analysis block', () => {
    writeConfig(JSON.stringify({ version: 1 }));
    expect(loadAnalysisExclude(tmpDir)).toEqual([]);
  });

  it('returns [] when the analysis block fails validation', () => {
    writeConfig(JSON.stringify({ version: 1, analysis: { exclude: 'not-an-array' } }));
    expect(loadAnalysisExclude(tmpDir)).toEqual([]);
  });
});
