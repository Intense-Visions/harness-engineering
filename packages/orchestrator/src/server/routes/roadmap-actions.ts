import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getRoadmapMode, parseRoadmap, serializeRoadmap } from '@harness-engineering/core';
import { z } from 'zod';
import { readBody } from '../utils.js';

/**
 * Per-request load of `harness.config.json` for the file-less stub guard. Returns
 * `null` on any error (missing, unreadable, or invalid JSON) — `getRoadmapMode`
 * tolerates `null` and defaults to `file-backed`. The project root is derived
 * from the roadmap path: `<root>/docs/roadmap.md` → `<root>`. Phase 4 will
 * replace this with typed plumbing through `WorkflowConfig.roadmap.mode`.
 */
async function loadProjectConfigFromRoadmapPath(
  roadmapPath: string
): Promise<{ roadmap?: { mode?: string } } | null> {
  try {
    const projectRoot = path.dirname(path.dirname(roadmapPath));
    const configPath = path.join(projectRoot, 'harness.config.json');
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as { roadmap?: { mode?: string } };
  } catch {
    return null;
  }
}

const AppendRoadmapRequestSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  labels: z.array(z.string()).optional(),
  enrichedSpec: z
    .object({
      intent: z.string(),
      unknowns: z.array(z.string()),
      ambiguities: z.array(z.string()),
      riskSignals: z.array(z.string()),
      affectedSystems: z.array(z.object({ name: z.string() })),
    })
    .optional(),
  cmlRecommendedRoute: z.enum(['local', 'human', 'simulation-required']).optional(),
});

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * POST /api/roadmap/append — Add a work item to the roadmap's Backlog milestone.
 * Returns `true` if the route matched, `false` otherwise.
 */
export function handleRoadmapActionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  roadmapPath: string | null
): boolean {
  if (req.method !== 'POST' || req.url !== '/api/roadmap/append') return false;

  void (async () => {
    try {
      if (!roadmapPath) {
        sendJSON(res, 503, { error: 'Roadmap path not configured' });
        return;
      }

      // Phase 3 stub: file-less mode is not yet wired through this endpoint.
      // Phase 4 will dispatch to RoadmapTrackerClient.append() (or equivalent).
      // Mirrors the canonical "not yet wired" message format used by S1-S5.
      const projectConfig = await loadProjectConfigFromRoadmapPath(roadmapPath);
      if (getRoadmapMode(projectConfig) === 'file-less') {
        sendJSON(res, 501, {
          error:
            'file-less roadmap mode is not yet wired in orchestrator roadmap-append endpoint; see Phase 4.',
        });
        return;
      }

      const body = await readBody(req);
      // harness-ignore SEC-DES-001: input validated by Zod schema (AppendRoadmapRequestSchema)
      const result = AppendRoadmapRequestSchema.safeParse(JSON.parse(body));
      if (!result.success) {
        sendJSON(res, 400, { error: result.error.issues[0]?.message ?? 'Invalid request body' });
        return;
      }
      const parsed = result.data;

      // Sanitize title — reject newlines or markdown headings
      if (parsed.title.includes('\n') || parsed.title.includes('###')) {
        sendJSON(res, 400, { error: 'Title must not contain newlines or markdown headings' });
        return;
      }

      const content = await fs.readFile(roadmapPath, 'utf-8');
      const roadmapResult = parseRoadmap(content);
      if (!roadmapResult.ok) {
        sendJSON(res, 500, { error: 'Failed to parse roadmap file' });
        return;
      }

      const roadmap = roadmapResult.value;

      // Find or create backlog milestone
      let backlog = roadmap.milestones.find((m) => m.isBacklog);
      if (!backlog) {
        backlog = { name: 'Backlog', isBacklog: true, features: [] };
        roadmap.milestones.push(backlog);
      }

      // Build summary from enriched spec or raw input
      let summary = parsed.summary ?? parsed.title;
      if (parsed.enrichedSpec?.intent) {
        summary = parsed.enrichedSpec.intent;
      }

      backlog.features.push({
        name: parsed.title,
        status: 'planned',
        spec: null,
        plans: [],
        blockedBy: [],
        summary,
        assignee: null,
        priority: null,
        externalId: null,
        updatedAt: null,
      });

      roadmap.frontmatter.lastManualEdit = new Date().toISOString();

      // Atomic write: write to temp file then rename
      const tmpPath = roadmapPath + '.tmp';
      const serialized = serializeRoadmap(roadmap);
      await fs.writeFile(tmpPath, serialized, 'utf-8');
      await fs.rename(tmpPath, roadmapPath);

      sendJSON(res, 201, { ok: true, featureName: parsed.title });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to append to roadmap';
      if (!res.headersSent) {
        sendJSON(res, 500, { error: msg });
      }
    }
  })();
  return true;
}
