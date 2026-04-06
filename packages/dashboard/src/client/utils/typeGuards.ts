import type { RoadmapData, HealthData, GraphData } from '@shared/types';

export function isRoadmapData(r: unknown): r is RoadmapData {
  return typeof r === 'object' && r !== null && 'totalFeatures' in r;
}

export function isHealthData(h: unknown): h is HealthData {
  return typeof h === 'object' && h !== null && 'totalIssues' in h;
}

export function isGraphData(g: unknown): g is GraphData {
  return (
    typeof g === 'object' && g !== null && 'available' in g && (g as GraphData).available === true
  );
}
