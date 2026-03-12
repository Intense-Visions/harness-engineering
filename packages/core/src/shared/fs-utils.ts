import { access, constants, readFile } from 'fs';
import { promisify } from 'util';
import { glob } from 'glob';
import type { Result } from './result';
import { Ok, Err } from './result';

const accessAsync = promisify(access);
const readFileAsync = promisify(readFile);

export async function fileExists(path: string): Promise<boolean> {
  try {
    await accessAsync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readFileContent(path: string): Promise<Result<string, Error>> {
  try {
    const content = await readFileAsync(path, 'utf-8');
    return Ok(content);
  } catch (error) {
    return Err(error as Error);
  }
}

// eslint-disable-next-line no-undef
export async function findFiles(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
  return glob(pattern, { cwd, absolute: true });
}
