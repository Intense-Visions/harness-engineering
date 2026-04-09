import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_CLIENT_PORT = 3700;
const DEFAULT_API_PORT = 3701;

interface DashboardOptions {
  port?: string;
  apiPort?: string;
  noOpen?: boolean;
  cwd?: string;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

/** Returns the built server entry or the dev TypeScript source, whichever exists first. */
function resolveServerScript(): { script: string; dev: boolean } | null {
  const built = [
    join(__dirname, '..', '..', '..', 'dashboard', 'dist', 'server', 'serve.js'),
    join(__dirname, '..', '..', '..', '..', 'packages', 'dashboard', 'dist', 'server', 'serve.js'),
  ].find((p) => existsSync(p));
  if (built) return { script: built, dev: false };

  const dev = [
    join(__dirname, '..', '..', '..', 'dashboard', 'src', 'server', 'serve.ts'),
    join(__dirname, '..', '..', '..', '..', 'packages', 'dashboard', 'src', 'server', 'serve.ts'),
  ].find((p) => existsSync(p));
  return dev ? { script: dev, dev: true } : null;
}

function spawnDashboardServer(
  server: { script: string; dev: boolean },
  env: NodeJS.ProcessEnv
): ReturnType<typeof spawn> {
  const child = server.dev
    ? spawn('tsx', [server.script], { env, stdio: 'inherit' })
    : spawn('node', [server.script], { env, stdio: 'inherit' });

  child.on('error', (e: Error) => {
    console.error(`Failed to start dashboard: ${e.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Dashboard server exited with code ${code}`);
      process.exit(code);
    }
  });

  return child;
}

function runDashboard(opts: DashboardOptions): void {
  const clientPort = Number(opts.port ?? DEFAULT_CLIENT_PORT);
  const apiPort = Number(opts.apiPort ?? DEFAULT_API_PORT);
  const projectPath = resolve(opts.cwd ?? process.cwd());
  const url = `http://localhost:${clientPort}`;
  const server = resolveServerScript();

  if (!server) {
    console.error('Could not locate the dashboard server. Run `pnpm build` in packages/dashboard.');
    process.exit(1);
  }

  const env = {
    ...process.env,
    DASHBOARD_API_PORT: String(apiPort),
    DASHBOARD_CLIENT_PORT: String(clientPort),
    HARNESS_PROJECT_PATH: projectPath,
  };

  spawnDashboardServer(server, env);

  console.log(`Dashboard API starting on http://localhost:${apiPort}`);
  console.log(`Open ${url} (pass --no-open to suppress)`);

  if (opts.noOpen !== true) {
    setTimeout(() => openBrowser(url), 1_500);
  }
}

export function createDashboardCommand(): Command {
  return new Command('dashboard')
    .description('Start the Harness local web dashboard')
    .option('--port <port>', 'Client dev server port', String(DEFAULT_CLIENT_PORT))
    .option('--api-port <port>', 'API server port', String(DEFAULT_API_PORT))
    .option('--no-open', 'Do not automatically open browser')
    .option('--cwd <path>', 'Project directory (defaults to cwd)')
    .action((opts: DashboardOptions) => runDashboard(opts));
}
