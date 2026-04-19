import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs/promises';
import { parseRoadmap, serializeRoadmap } from '@harness-engineering/core';
import { z } from 'zod';
import { readBody } from '../utils.js';

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
