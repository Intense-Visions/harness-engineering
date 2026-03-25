import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { WorkspaceConfig, Result, Ok, Err } from '@harness-engineering/types';

export class WorkspaceManager {
  private config: WorkspaceConfig;

  constructor(config: WorkspaceConfig) {
    this.config = config;
  }

  /**
   * Sanitizes an issue identifier to be safe for use as a directory name.
   */
  public sanitizeIdentifier(identifier: string): string {
    return identifier
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Resolves the full path for an issue's workspace.
   */
  public resolvePath(identifier: string): string {
    const sanitized = this.sanitizeIdentifier(identifier);
    return path.join(this.config.root, sanitized);
  }

  /**
   * Ensures the workspace directory exists.
   */
  public async ensureWorkspace(identifier: string): Promise<Result<string, Error>> {
    try {
      const workspacePath = this.resolvePath(identifier);
      await fs.mkdir(workspacePath, { recursive: true });
      return Ok(workspacePath);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Checks if a workspace exists.
   */
  public async exists(identifier: string): Promise<boolean> {
    try {
      const workspacePath = this.resolvePath(identifier);
      await fs.access(workspacePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Removes a workspace directory.
   */
  public async removeWorkspace(identifier: string): Promise<Result<void, Error>> {
    try {
      const workspacePath = this.resolvePath(identifier);
      await fs.rm(workspacePath, { recursive: true, force: true });
      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
