import { Hono } from 'hono';
import type { Context } from 'hono';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import type { ServerContext } from '../context';
import { gatherSecurity } from '../gather/security';
import { gatherPerf } from '../gather/perf';
import { gatherArch } from '../gather/arch';
import { gatherAnomalies } from '../gather/anomalies';
import type { ChecksData, SSEEvent } from '../../shared/types';

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

type RoadmapUpdateResult = { updated: string } | { error: string; code: number };

async function updateRoadmapContent(
  roadmapPath: string,
  feature: string,
  status: string
): Promise<RoadmapUpdateResult> {
  let content: string;
  try {
    content = await readFile(roadmapPath, 'utf-8');
  } catch {
    return { error: 'Could not read roadmap file', code: 500 };
  }

  // Finding 12 + ReDoS fix: use indexOf instead of regex to avoid catastrophic backtracking
  // Find the heading line that matches "### <feature>" with a word boundary
  const headingPrefix = '### ';
  let headingIdx = -1;
  let searchFrom = 0;
  while (searchFrom < content.length) {
    const idx = content.indexOf(headingPrefix, searchFrom);
    if (idx === -1) break;
    const nameStart = idx + headingPrefix.length;
    // Allow optional extra whitespace between ### and feature name
    let nameActual = nameStart;
    while (nameActual < content.length && content[nameActual] === ' ') nameActual++;
    if (content.startsWith(feature, nameActual)) {
      const afterFeature = nameActual + feature.length;
      // Ensure word boundary: next char must be whitespace, newline, or end of string
      if (
        afterFeature >= content.length ||
        content[afterFeature] === ' ' ||
        content[afterFeature] === '\n' ||
        content[afterFeature] === '\r'
      ) {
        headingIdx = idx;
        break;
      }
    }
    // Move past this heading line
    const nextNewline = content.indexOf('\n', idx);
    searchFrom = nextNewline === -1 ? content.length : nextNewline + 1;
  }

  if (headingIdx === -1) {
    return { error: `Feature '${feature}' not found in roadmap`, code: 404 };
  }

  // From the heading, find the next "**Status:**" marker
  const statusMarker = '**Status:**';
  const statusIdx = content.indexOf(statusMarker, headingIdx);
  if (statusIdx === -1) {
    return { error: `Feature '${feature}' not found in roadmap`, code: 404 };
  }

  // Skip past the marker and any trailing whitespace (but not newlines)
  let valueStart = statusIdx + statusMarker.length;
  while (valueStart < content.length && content[valueStart] === ' ') valueStart++;

  // Find the end of the status value (next newline or end of string)
  let valueEnd = content.indexOf('\n', valueStart);
  if (valueEnd === -1) valueEnd = content.length;

  const updated = content.slice(0, valueStart) + status + content.slice(valueEnd);
  try {
    await writeFile(roadmapPath, updated, 'utf-8');
  } catch {
    return { error: 'Could not write roadmap file', code: 500 };
  }

  return { updated };
}

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
    const outcome = await updateRoadmapContent(ctx.roadmapPath, feature, status);
    if ('error' in outcome) {
      result = c.json({ error: outcome.error }, outcome.code as 404 | 500);
      return;
    }
    ctx.cache.invalidate('roadmap');
    ctx.cache.invalidate('overview');
    result = c.json({ ok: true, feature, status });
  });

  return result!;
}

interface ValidateState {
  out: string[];
  err: string[];
  outSize: number;
  errSize: number;
  timedOut: boolean;
}

function setupValidateHandlers(
  child: ReturnType<typeof spawn>,
  state: ValidateState,
  timer: ReturnType<typeof setTimeout>,
  settle: (r: Response) => void,
  c: Context
): void {
  child.stdout?.on('data', (d: Buffer) => {
    if (state.outSize < MAX_OUTPUT_BYTES) {
      const chunk = d.toString();
      state.out.push(chunk);
      state.outSize += chunk.length;
    }
  });
  child.stderr?.on('data', (d: Buffer) => {
    if (state.errSize < MAX_OUTPUT_BYTES) {
      const chunk = d.toString();
      state.err.push(chunk);
      state.errSize += chunk.length;
    }
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (state.timedOut) return;
    const stdout =
      state.outSize >= MAX_OUTPUT_BYTES
        ? state.out.join('').slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated]'
        : state.out.join('');
    const stderr =
      state.errSize >= MAX_OUTPUT_BYTES
        ? state.err.join('').slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated]'
        : state.err.join('');
    settle(c.json({ ok: code === 0, exitCode: code, stdout, stderr }));
  });
  child.on('error', (e: Error) => {
    clearTimeout(timer);
    if (state.timedOut) return;
    settle(c.json({ ok: false, error: e.message }, 500));
  });
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

    const state: ValidateState = { out: [], err: [], outSize: 0, errSize: 0, timedOut: false };
    let settled = false;

    function settle(response: Response) {
      if (settled) return;
      settled = true;
      validating = false;
      resolve(response);
    }

    // Finding 4: 30s timeout
    const timer = setTimeout(() => {
      state.timedOut = true;
      child.kill();
      settle(
        c.json({ ok: false, exitCode: -1, stdout: '', stderr: 'Validation timed out after 30s' })
      );
    }, VALIDATE_TIMEOUT_MS);

    setupValidateHandlers(child, state, timer, settle, c);
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
      // harness-ignore SEC-PTH-001: chartsPath from ctx.chartsPath (server config); concatenation is file content, not path
      await writeFile(chartsPath, stripped + marker, 'utf-8');
    } catch {
      // Non-fatal: caches already invalidated
    }
  });

  return c.json({ ok: true, regeneratedAt: new Date().toISOString() });
}

async function handleRefreshChecks(c: Context, ctx: ServerContext): Promise<Response> {
  const [security, perf, arch, anomalies] = await Promise.all([
    ctx.gatherCache.refresh('security', () => gatherSecurity(ctx.projectPath)),
    ctx.gatherCache.refresh('perf', () => gatherPerf(ctx.projectPath)),
    ctx.gatherCache.refresh('arch', () => gatherArch(ctx.projectPath)),
    ctx.gatherCache.refresh('anomalies', () => gatherAnomalies(ctx.projectPath)),
  ]);

  const checksData: ChecksData = {
    security,
    perf,
    arch,
    anomalies,
    lastRun: new Date().toISOString(),
  };

  const checksEvent: SSEEvent = {
    type: 'checks',
    data: checksData,
    timestamp: new Date().toISOString(),
  };

  await ctx.sseManager.broadcast(checksEvent);

  return c.json({ ok: true, checks: checksData });
}

export function buildActionsRouter(ctx: ServerContext): Hono {
  const router = new Hono();
  router.post('/actions/roadmap-status', (c) => handleRoadmapStatus(c, ctx));
  router.post('/actions/validate', (c) => handleValidate(c, ctx));
  router.post('/actions/regen-charts', (c) => handleRegenCharts(c, ctx));
  router.post('/actions/refresh-checks', (c) => handleRefreshChecks(c, ctx));
  return router;
}
