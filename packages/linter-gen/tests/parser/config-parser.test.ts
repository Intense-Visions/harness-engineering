import { describe, it, expect } from 'vitest';
import { parseConfig, ParseError } from '../../src/parser/config-parser';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../fixtures');

describe('parseConfig', () => {
  it('parses valid YAML config', async () => {
    const configPath = path.join(fixturesDir, 'valid-config.yml');
    const result = await parseConfig(configPath);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.output).toBe('./generated/eslint-rules');
      expect(result.data.rules).toHaveLength(2);
      expect(result.data.rules[0].name).toBe('no-ui-in-services');
    }
  });

  it('returns error for invalid config', async () => {
    const configPath = path.join(fixturesDir, 'invalid-config.yml');
    const result = await parseConfig(configPath);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ParseError);
      expect(result.error.message).toContain('version');
    }
  });

  it('returns error for non-existent file', async () => {
    const result = await parseConfig('/does/not/exist.yml');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FILE_NOT_FOUND');
    }
  });

  it('returns error for invalid YAML syntax', async () => {
    const configPath = path.join(fixturesDir, 'invalid-yaml.yml');
    const result = await parseConfig(configPath);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('YAML_PARSE_ERROR');
    }
  });
});
