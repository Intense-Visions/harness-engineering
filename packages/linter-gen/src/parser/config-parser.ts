/// <reference types="node" />
import * as fs from 'fs/promises';
import * as yaml from 'yaml';
import { LinterConfigSchema, type LinterConfig } from '../schema/linter-config.js';

export type ParseErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_READ_ERROR'
  | 'YAML_PARSE_ERROR'
  | 'VALIDATION_ERROR';

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly code: ParseErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export type ParseResult =
  | { success: true; data: LinterConfig; configPath: string }
  | { success: false; error: ParseError };

/**
 * Parse and validate a harness-linter.yml config file
 */
export async function parseConfig(configPath: string): Promise<ParseResult> {
  // Read file
  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      return {
        success: false,
        error: new ParseError(`Config file not found: ${configPath}`, 'FILE_NOT_FOUND', err),
      };
    }
    return {
      success: false,
      error: new ParseError(`Failed to read config file: ${configPath}`, 'FILE_READ_ERROR', err),
    };
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.parse(content);
  } catch (err) {
    return {
      success: false,
      error: new ParseError(
        `Invalid YAML syntax in ${configPath}: ${(err as Error).message}`,
        'YAML_PARSE_ERROR',
        err
      ),
    };
  }

  // Validate with Zod
  const result = LinterConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return {
      success: false,
      error: new ParseError(`Invalid config: ${issues}`, 'VALIDATION_ERROR', result.error),
    };
  }

  return {
    success: true,
    data: result.data,
    configPath,
  };
}
