import * as path from 'path';

/**
 * Validates and resolves an input path, rejecting filesystem root
 * to prevent accidental broad filesystem access via MCP tools.
 */
export function sanitizePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  if (resolved === '/' || resolved === path.parse(resolved).root) {
    throw new Error('Invalid project path: cannot use filesystem root');
  }
  return resolved;
}
