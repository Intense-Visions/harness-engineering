import * as fs from 'node:fs/promises';
import { Result, Ok, Err } from '../../shared/result';

/**
 * Utility to write a config object to disk as JSON or YAML.
 * In this implementation, we'll keep it simple and just use JSON.stringify
 * or a placeholder for YAML if needed.
 */
export async function writeConfig(
  filePath: string,
  content: unknown
): Promise<Result<void, Error>> {
  try {
    const json = JSON.stringify(content, null, 2) + '\n';
    await fs.writeFile(filePath, json, 'utf-8');
    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}
