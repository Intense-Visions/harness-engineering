import { Hono } from 'hono';
import type { Context } from 'hono';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerContext } from '../context';

async function handleRoadmapStatus(c: Context, ctx: ServerContext): Promise<Response> {
  const body = await c.req.json<{ feature?: string; status?: string }>();
  const { feature, status } = body;
  if (!feature || !status) {
    return c.json({ error: 'feature and status are required' }, 400);
  }

  let content: string;
  try {
    content = await readFile(ctx.roadmapPath, 'utf-8');
  } catch {
    return c.json({ error: 'Could not read roadmap file' }, 500);
  }

  const escapedName = feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionPattern = new RegExp(
    `(###\\s+${escapedName}[\\s\\S]*?\\*\\*Status:\\*\\*\\s*)([^\\n]+)`
  );

  if (!sectionPattern.test(content)) {
    return c.json({ error: `Feature '${feature}' not found in roadmap` }, 404);
  }

  const updated = content.replace(sectionPattern, `$1${status}`);
  try {
    await writeFile(ctx.roadmapPath, updated, 'utf-8');
  } catch {
    return c.json({ error: 'Could not write roadmap file' }, 500);
  }

  ctx.cache.invalidate('roadmap');
  ctx.cache.invalidate('overview');
  return c.json({ ok: true, feature, status });
}

function handleValidate(c: Context, ctx: ServerContext): Promise<Response> {
  return new Promise<Response>((resolve) => {
    const child = spawn('pnpm', ['harness', 'validate'], {
      cwd: ctx.projectPath,
      shell: false,
    });

    const out: string[] = [];
    const err: string[] = [];

    child.stdout.on('data', (d: Buffer) => out.push(d.toString()));
    child.stderr.on('data', (d: Buffer) => err.push(d.toString()));
    child.on('close', (code) => {
      resolve(
        c.json({ ok: code === 0, exitCode: code, stdout: out.join(''), stderr: err.join('') })
      );
    });
    child.on('error', (e: Error) => {
      resolve(c.json({ ok: false, error: e.message }, 500));
    });
  });
}

async function handleRegenCharts(c: Context, ctx: ServerContext): Promise<Response> {
  ctx.cache.invalidate('roadmap');
  ctx.cache.invalidate('health');
  ctx.cache.invalidate('graph');
  ctx.cache.invalidate('overview');

  const chartsPath = join(ctx.projectPath, 'docs', 'roadmap-charts.md');
  const marker = `\n<!-- charts regenerated at ${new Date().toISOString()} -->\n`;
  try {
    const existing = await readFile(chartsPath, 'utf-8').catch(() => '# Roadmap Charts\n');
    const stripped = existing.replace(/\n<!-- charts regenerated at .+? -->\n/g, '');
    await writeFile(chartsPath, stripped + marker, 'utf-8');
  } catch {
    // Non-fatal: caches already invalidated
  }

  return c.json({ ok: true, regeneratedAt: new Date().toISOString() });
}

export function buildActionsRouter(ctx: ServerContext): Hono {
  const router = new Hono();
  router.post('/actions/roadmap-status', (c) => handleRoadmapStatus(c, ctx));
  router.post('/actions/validate', (c) => handleValidate(c, ctx));
  router.post('/actions/regen-charts', (c) => handleRegenCharts(c, ctx));
  return router;
}
