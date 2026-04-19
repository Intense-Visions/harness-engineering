import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const DEFAULT_CLIENT_PORT = 3700;
const DEFAULT_API_PORT = 3701;

interface DashboardOptions {
  port?: string;
  apiPort?: string;
  orchestratorUrl?: string;
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
  // 1. Resolve via node_modules (works for global installs and workspace links)
  try {
    const pkgPath = require.resolve('@harness-engineering/dashboard/package.json');
    const pkgDir = dirname(pkgPath);
    const built = join(pkgDir, 'dist', 'server', 'serve.js');
    if (existsSync(built)) return { script: built, dev: false };
    const dev = join(pkgDir, 'src', 'server', 'serve.ts');
    if (existsSync(dev)) return { script: dev, dev: true };
  } catch {
    // Package not resolvable — fall through to relative paths
  }

  // 2. Fallback: relative paths for monorepo dev without workspace linking
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
  // The Hono server serves both API and built client from the API port
  const url = `http://localhost:${apiPort}`;
  const server = resolveServerScript();

  if (!server) {
    console.error('Could not locate the dashboard server. Run `pnpm build` in packages/dashboard.');
    process.exit(1);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DASHBOARD_API_PORT: String(apiPort),
    DASHBOARD_CLIENT_PORT: String(clientPort),
    HARNESS_PROJECT_PATH: projectPath,
  };

  // Forward orchestrator connection info
  if (opts.orchestratorUrl) {
    env['ORCHESTRATOR_URL'] = opts.orchestratorUrl;
  } else if (!env['ORCHESTRATOR_URL'] && !env['ORCHESTRATOR_PORT']) {
    // Default: assume orchestrator is on localhost:8080
    env['ORCHESTRATOR_PORT'] = '8080';
  }

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
    .option('--orchestrator-url <url>', 'Orchestrator URL (default: http://localhost:8080)')
    .option('--no-open', 'Do not automatically open browser')
    .option('--cwd <path>', 'Project directory (defaults to cwd)')
    .action((opts: DashboardOptions) => runDashboard(opts));
}
