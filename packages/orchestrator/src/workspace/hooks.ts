import { spawn } from 'node:child_process';
import { HooksConfig, Result, Ok, Err } from '@harness-engineering/types';

export class WorkspaceHooks {
  private config: HooksConfig;

  constructor(config: HooksConfig) {
    this.config = config;
  }

  /**
   * Executes a shell hook in the specified workspace directory.
   */
  public async executeHook(
    hookName: keyof Omit<HooksConfig, 'timeoutMs'>,
    cwd: string
  ): Promise<Result<void, Error>> {
    const command = this.config[hookName];
    if (!command) {
      return Ok(undefined);
    }

    return new Promise((resolve) => {
      const child = spawn(command, {
        shell: true,
        cwd,
        env: process.env,
      });

      const timeout = setTimeout(() => {
        child.kill();
        resolve(Err(new Error(`Hook ${hookName} timed out after ${this.config.timeoutMs}ms`)));
      }, this.config.timeoutMs);

      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(Ok(undefined));
        } else {
          resolve(Err(new Error(`Hook ${hookName} failed with exit code ${code}`)));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve(Err(error));
      });
    });
  }

  public async afterCreate(cwd: string): Promise<Result<void, Error>> {
    return this.executeHook('afterCreate', cwd);
  }

  public async beforeRun(cwd: string): Promise<Result<void, Error>> {
    return this.executeHook('beforeRun', cwd);
  }

  public async afterRun(cwd: string): Promise<Result<void, Error>> {
    return this.executeHook('afterRun', cwd);
  }

  public async beforeRemove(cwd: string): Promise<Result<void, Error>> {
    return this.executeHook('beforeRemove', cwd);
  }
}
