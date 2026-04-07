import type {
  RoadmapData,
  HealthData,
  GraphData,
  SecurityData,
  PerfData,
  ArchData,
} from '@shared/types';

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

export function isSecurityData(s: unknown): s is SecurityData {
  return typeof s === 'object' && s !== null && 'findings' in s && 'stats' in s;
}

export function isPerfData(p: unknown): p is PerfData {
  return typeof p === 'object' && p !== null && 'violations' in p && 'stats' in p;
}

export function isArchData(a: unknown): a is ArchData {
  return typeof a === 'object' && a !== null && 'passed' in a && 'totalViolations' in a;
}
