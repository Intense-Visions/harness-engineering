import { execFile, spawn } from 'node:child_process';
import type {
  ContainerRuntime,
  ContainerCreateOpts,
  ContainerExecOpts,
  ContainerHandle,
  ContainerError,
  Result,
} from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';

function dockerExec(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile('docker', args, (error, stdout) => {
      if (error) {
        reject(error as Error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export class DockerRuntime implements ContainerRuntime {
  readonly name = 'docker';

  async createContainer(
    opts: ContainerCreateOpts
  ): Promise<Result<ContainerHandle, ContainerError>> {
    try {
      const args: string[] = ['create'];

      if (opts.readOnly) {
        args.push('--read-only');
      }

      args.push('--user', opts.user);
      args.push('--network', opts.network);
      args.push('-v', `${opts.workspacePath}:/workspace`);
      args.push('-w', '/workspace');

      for (const [key, value] of Object.entries(opts.env)) {
        args.push('--env', `${key}=${value}`);
      }

      if (opts.extraArgs) {
        args.push(...opts.extraArgs);
      }

      args.push(opts.image);
      // Keep the container running with a sleep command so we can exec into it
      args.push('sleep', 'infinity');

      const containerId = await dockerExec(args);
      return Ok({ containerId, runtime: this.name });
    } catch (error) {
      return Err({
        category: 'container_create_failed',
        message: `Failed to create container: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
      });
    }
  }

  async *execInContainer(
    handle: ContainerHandle,
    cmd: string[],
    opts?: ContainerExecOpts
  ): AsyncGenerator<string, number, void> {
    // Start the container if not already running
    try {
      await dockerExec(['start', handle.containerId]);
    } catch {
      // Container may already be running — that's fine
    }

    const execArgs: string[] = ['exec'];

    if (opts?.cwd) {
      execArgs.push('-w', opts.cwd);
    }

    if (opts?.env) {
      for (const [key, value] of Object.entries(opts.env)) {
        execArgs.push('--env', `${key}=${value}`);
      }
    }

    execArgs.push(handle.containerId, ...cmd);

    const child = spawn('docker', execArgs);
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: child.stdout, terminal: false });

    try {
      for await (const line of rl) {
        yield line;
      }
    } finally {
      rl.close();
    }

    const exitCode = await new Promise<number>((resolve) => {
      if (child.exitCode !== null) {
        resolve(child.exitCode);
      } else {
        child.on('exit', (code) => resolve(code ?? 1));
      }
    });

    return exitCode;
  }

  async removeContainer(handle: ContainerHandle): Promise<Result<void, ContainerError>> {
    try {
      await dockerExec(['rm', '-f', handle.containerId]);
      return Ok(undefined);
    } catch (error) {
      return Err({
        category: 'container_remove_failed',
        message: `Failed to remove container: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
      });
    }
  }

  async healthCheck(): Promise<Result<void, ContainerError>> {
    try {
      await dockerExec(['info', '--format', '{{.ServerVersion}}']);
      return Ok(undefined);
    } catch (error) {
      return Err({
        category: 'runtime_not_found',
        message: `Docker is not available: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
      });
    }
  }
}
