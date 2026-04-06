import { Hono } from 'hono';
import type { Context } from 'hono';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import type { ServerContext } from '../context';

// --- Finding 3: File lock to prevent TOCTOU races ---
const fileLocks = new Map<string, Promise<void>>();

async function withFileLock(path: string, fn: () => Promise<void>): Promise<void> {
  const prev = fileLocks.get(path) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  fileLocks.set(path, next);
  try {
    await next;
  } finally {
    // Clean up if we are still the latest in the chain
    if (fileLocks.get(path) === next) {
      fileLocks.delete(path);
    }
  }
}

// --- Finding 6: Valid status values ---
const VALID_STATUSES = new Set<string>(['done', 'in-progress', 'planned', 'blocked', 'backlog']);

// --- Finding 14: Rate limit for validate ---
let validating = false;

// --- Finding 4: Output cap constant (512 KB) ---
const MAX_OUTPUT_BYTES = 512 * 1024;
const VALIDATE_TIMEOUT_MS = 30_000;

async function handleRoadmapStatus(c: Context, ctx: ServerContext): Promise<Response> {
  const body = await c.req.json<{ feature?: string; status?: string }>();
  const { feature, status } = body;
  if (!feature || !status) {
    return c.json({ error: 'feature and status are required' }, 400);
  }

  // Finding 6: Validate status string
  if (!VALID_STATUSES.has(status)) {
    return c.json(
      {
        error: `Invalid status '${status}'. Must be one of: done, in-progress, planned, blocked, backlog`,
      },
      400
    );
  }

  let result: Response | undefined;

  await withFileLock(ctx.roadmapPath, async () => {
    let content: string;
    try {
      content = await readFile(ctx.roadmapPath, 'utf-8');
    } catch {
      result = c.json({ error: 'Could not read roadmap file' }, 500);
      return;
    }

    const escapedName = feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Finding 12: Add (?=\s|$) to prevent prefix collisions
    const sectionPattern = new RegExp(
      `(###\\s+${escapedName}(?=\\s|$)[\\s\\S]*?\\*\\*Status:\\*\\*\\s*)([^\\n]+)`
    );

    if (!sectionPattern.test(content)) {
      result = c.json({ error: `Feature '${feature}' not found in roadmap` }, 404);
      return;
    }

    const updated = content.replace(sectionPattern, `$1${status}`);
    try {
      await writeFile(ctx.roadmapPath, updated, 'utf-8');
    } catch {
      result = c.json({ error: 'Could not write roadmap file' }, 500);
      return;
    }

    ctx.cache.invalidate('roadmap');
    ctx.cache.invalidate('overview');
    result = c.json({ ok: true, feature, status });
  });

  return result!;
}

function handleValidate(c: Context, ctx: ServerContext): Promise<Response> {
  // Finding 14: Prevent concurrent validations
  if (validating) {
    return Promise.resolve(c.json({ error: 'Validation already in progress' }, 429));
  }
  validating = true;

  return new Promise<Response>((resolve) => {
    const child = spawn('pnpm', ['harness', 'validate'], {
      cwd: ctx.projectPath,
      shell: false,
    });

    const out: string[] = [];
    const err: string[] = [];
    let outSize = 0;
    let errSize = 0;
    let timedOut = false;
    let settled = false;

    function settle(response: Response) {
      if (settled) return;
      settled = true;
      validating = false;
      resolve(response);
    }

    // Finding 4: 30s timeout
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      settle(
        c.json({
          ok: false,
          exitCode: -1,
          stdout: '',
          stderr: 'Validation timed out after 30s',
        })
      );
    }, VALIDATE_TIMEOUT_MS);

    // Finding 4: Cap accumulated output at 512 KB
    child.stdout.on('data', (d: Buffer) => {
      if (outSize < MAX_OUTPUT_BYTES) {
        const chunk = d.toString();
        out.push(chunk);
        outSize += chunk.length;
      }
    });
    child.stderr.on('data', (d: Buffer) => {
      if (errSize < MAX_OUTPUT_BYTES) {
        const chunk = d.toString();
        err.push(chunk);
        errSize += chunk.length;
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      const stdout =
        outSize >= MAX_OUTPUT_BYTES
          ? out.join('').slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated]'
          : out.join('');
      const stderr =
        errSize >= MAX_OUTPUT_BYTES
          ? err.join('').slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated]'
          : err.join('');
      settle(c.json({ ok: code === 0, exitCode: code, stdout, stderr }));
    });
    child.on('error', (e: Error) => {
      clearTimeout(timer);
      if (timedOut) return;
      settle(c.json({ ok: false, error: e.message }, 500));
    });
  });
}

async function handleRegenCharts(c: Context, ctx: ServerContext): Promise<Response> {
  ctx.cache.invalidate('roadmap');
  ctx.cache.invalidate('health');
  ctx.cache.invalidate('graph');
  ctx.cache.invalidate('overview');

  // Finding 22: use ctx.chartsPath
  const chartsPath = ctx.chartsPath;
  const marker = `\n<!-- charts regenerated at ${new Date().toISOString()} -->\n`;

  // Finding 3: Serialize writes to chartsPath
  await withFileLock(chartsPath, async () => {
    try {
      const existing = await readFile(chartsPath, 'utf-8').catch(() => '# Roadmap Charts\n');
      const stripped = existing.replace(/\n<!-- charts regenerated at .+? -->\n/g, '');
      await writeFile(chartsPath, stripped + marker, 'utf-8');
    } catch {
      // Non-fatal: caches already invalidated
    }
  });

  return c.json({ ok: true, regeneratedAt: new Date().toISOString() });
}

export function buildActionsRouter(ctx: ServerContext): Hono {
  const router = new Hono();
  router.post('/actions/roadmap-status', (c) => handleRoadmapStatus(c, ctx));
  router.post('/actions/validate', (c) => handleValidate(c, ctx));
  router.post('/actions/regen-charts', (c) => handleRegenCharts(c, ctx));
  return router;
}
