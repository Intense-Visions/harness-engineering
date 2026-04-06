import { Hono } from 'hono';
import { gatherRoadmap } from '../gather/roadmap';
import type { ApiResponse, RoadmapResult, RoadmapData } from '../../shared/types';
import type { ServerContext } from '../context';

export interface BlockerEdge {
  from: string;
  to: string;
}

export interface RoadmapChartsData {
  milestones: RoadmapData['milestones'];
  features: RoadmapData['features'];
  blockerEdges: BlockerEdge[];
}

const CACHE_KEY = 'roadmap';

async function getOrFetch(ctx: ServerContext): Promise<RoadmapResult> {
  const cached = ctx.cache.get<RoadmapResult>(CACHE_KEY);
  if (cached) return cached.data;
  const data = await gatherRoadmap(ctx.roadmapPath);
  ctx.cache.set(CACHE_KEY, data);
  return data;
}

function buildBlockerEdges(data: RoadmapData): BlockerEdge[] {
  const edges: BlockerEdge[] = [];
  for (const feature of data.features) {
    for (const blocker of feature.blockedBy) {
      edges.push({ from: blocker, to: feature.name });
    }
  }
  return edges;
}

export function buildRoadmapRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/roadmap', async (c) => {
    const data = await getOrFetch(ctx);
    const entry = ctx.cache.get<RoadmapResult>(CACHE_KEY);
    const timestamp = entry ? new Date(entry.timestamp).toISOString() : new Date().toISOString();
    const response: ApiResponse<RoadmapResult> = { data, timestamp };
    return c.json(response);
  });

  router.get('/roadmap/charts', async (c) => {
    const data = await getOrFetch(ctx);
    const entry = ctx.cache.get<RoadmapResult>(CACHE_KEY);
    const timestamp = entry ? new Date(entry.timestamp).toISOString() : new Date().toISOString();

    // If the gatherer failed, return the error directly
    if ('error' in data) {
      const response: ApiResponse<RoadmapResult> = { data, timestamp };
      return c.json(response);
    }

    const chartsData: RoadmapChartsData = {
      milestones: data.milestones,
      features: data.features,
      blockerEdges: buildBlockerEdges(data),
    };
    const response: ApiResponse<RoadmapChartsData> = { data: chartsData, timestamp };
    return c.json(response);
  });

  return router;
}
