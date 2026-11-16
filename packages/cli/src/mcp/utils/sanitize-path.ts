import * as path from 'path';

/**
 * Validates and resolves an input path, rejecting filesystem root
 * to prevent accidental broad filesystem access via MCP tools.
 *
 * MCP arguments arrive unvalidated, so a missing or misnamed argument reaches
 * here as `undefined`. Reject it with a message naming the problem instead of
 * letting `path.resolve` throw Node's opaque `The "paths[0]" argument must be
 * of type string` (issue #2253).
 */
export function sanitizePath(inputPath: string): string {
  if (typeof inputPath !== 'string') {
    throw new Error(
      `Invalid path: expected a string (the project root), received ${
        inputPath === undefined ? 'undefined' : typeof inputPath
      }`
    );
  }
  const resolved = path.resolve(inputPath);
  if (resolved === '/' || resolved === path.parse(resolved).root) {
    throw new Error('Invalid project path: cannot use filesystem root');
  }
  return resolved;
}

/** Project-root arguments a tool accepts: the documented `path`, or its common alias `projectPath`. */
export interface ProjectRootArgs {
  path?: unknown;
  projectPath?: unknown;
}

/**
 * Resolve a tool's project root from `path`, falling back to the `projectPath`
 * alias, then to the server's working directory (the root `harness mcp` was
 * started in) when neither is given. The result is sanitized like any other
 * path, so a non-string value is still rejected with an actionable message.
 */
export function resolveProjectRootArg(input: ProjectRootArgs): string {
  const raw = input.path ?? input.projectPath ?? process.cwd();
  return sanitizePath(raw as string);
}
