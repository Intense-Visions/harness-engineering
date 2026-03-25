import { access, constants, readFile } from 'fs';
import { promisify } from 'util';
import { glob } from 'glob';
import type { Result } from './result';
import { Ok, Err } from './result';

const accessAsync = promisify(access);
const readFileAsync = promisify(readFile);

/**
 * Checks if a file or directory exists at the specified path.
 *
 * @param path - The file system path to check.
 * @returns A promise that resolves to true if the path exists, false otherwise.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await accessAsync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the content of a file as a UTF-8 string.
 *
 * @param path - The path to the file to read.
 * @returns A promise that resolves to a Result containing the file content or an Error.
 */
export async function readFileContent(path: string): Promise<Result<string, Error>> {
  try {
    const content = await readFileAsync(path, 'utf-8');
    return Ok(content);
  } catch (error) {
    return Err(error as Error);
  }
}

/**
 * Finds files matching a glob pattern.
 *
 * @param pattern - The glob pattern to search for.
 * @param cwd - The current working directory for the search (default: process.cwd()).
 * @returns A promise that resolves to an array of absolute file paths matching the pattern.
 */
export async function findFiles(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
  return glob(pattern, { cwd, absolute: true });
}
