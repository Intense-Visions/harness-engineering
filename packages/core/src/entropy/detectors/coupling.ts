import { Ok } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  CodebaseSnapshot,
  CouplingConfig,
  CouplingReport,
  CouplingViolation,
  EntropyError,
} from '../types';

export interface GraphCouplingData {
  files: Array<{
    file: string;
    fanIn: number;
    fanOut: number;
    couplingRatio: number;
    transitiveDepth: number;
  }>;
}

const DEFAULT_THRESHOLDS = {
  fanOut: { warn: 15 },
  fanIn: { info: 20 },
  couplingRatio: { warn: 0.7 },
  transitiveDependencyDepth: { info: 30 },
};

interface FileMetrics {
  file: string;
  fanIn: number;
  fanOut: number;
  couplingRatio: number;
  transitiveDepth: number;
}

function computeMetricsFromSnapshot(snapshot: CodebaseSnapshot): FileMetrics[] {
  const fanInMap = new Map<string, number>();

  for (const file of snapshot.files) {
    for (const imp of file.imports) {
      const resolved = resolveImportSource(imp.source, file.path, snapshot);
      if (resolved) {
        fanInMap.set(resolved, (fanInMap.get(resolved) || 0) + 1);
      }
    }
  }

  return snapshot.files.map((file) => {
    const fanOut = file.imports.length;
    const fanIn = fanInMap.get(file.path) || 0;
    const total = fanIn + fanOut;
    const couplingRatio = total > 0 ? fanOut / total : 0;

    return {
      file: file.path,
      fanIn,
      fanOut,
      couplingRatio,
      transitiveDepth: 0,
    };
  });
}

function resolveRelativePath(from: string, source: string): string {
  const dir = from.includes('/') ? from.substring(0, from.lastIndexOf('/')) : '.';
  const parts = dir.split('/');
  for (const segment of source.split('/')) {
    if (segment === '.') continue;
    if (segment === '..') {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join('/');
}

function resolveImportSource(
  source: string,
  fromFile: string,
  snapshot: CodebaseSnapshot
): string | undefined {
  if (!source.startsWith('.') && !source.startsWith('/')) {
    return undefined;
  }

  const resolved = resolveRelativePath(fromFile, source);
  const filePaths = snapshot.files.map((f) => f.path);

  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}/index.ts`,
    `${resolved}/index.tsx`,
  ];

  for (const candidate of candidates) {
    const match = filePaths.find((fp) => fp === candidate);
    if (match) return match;
  }

  return undefined;
}

type ResolvedThresholds = {
  fanOut: { warn: number };
  fanIn: { info: number };
  couplingRatio: { warn: number };
  transitiveDependencyDepth: { info: number };
};

function resolveThresholds(config?: Partial<CouplingConfig>): ResolvedThresholds {
  return {
    fanOut: { ...DEFAULT_THRESHOLDS.fanOut, ...config?.thresholds?.fanOut },
    fanIn: { ...DEFAULT_THRESHOLDS.fanIn, ...config?.thresholds?.fanIn },
    couplingRatio: { ...DEFAULT_THRESHOLDS.couplingRatio, ...config?.thresholds?.couplingRatio },
    transitiveDependencyDepth: {
      ...DEFAULT_THRESHOLDS.transitiveDependencyDepth,
      ...config?.thresholds?.transitiveDependencyDepth,
    },
  };
}

function checkFanOut(m: FileMetrics, threshold: number): CouplingViolation | null {
  if (m.fanOut <= threshold) return null;
  return {
    file: m.file,
    metric: 'fanOut',
    value: m.fanOut,
    threshold,
    tier: 2,
    severity: 'warning',
    message: `File has ${m.fanOut} imports (threshold: ${threshold})`,
  };
}

function checkFanIn(m: FileMetrics, threshold: number): CouplingViolation | null {
  if (m.fanIn <= threshold) return null;
  return {
    file: m.file,
    metric: 'fanIn',
    value: m.fanIn,
    threshold,
    tier: 3,
    severity: 'info',
    message: `File is imported by ${m.fanIn} files (threshold: ${threshold})`,
  };
}

function checkCouplingRatio(m: FileMetrics, threshold: number): CouplingViolation | null {
  const totalConnections = m.fanIn + m.fanOut;
  if (totalConnections <= 5 || m.couplingRatio <= threshold) return null;
  return {
    file: m.file,
    metric: 'couplingRatio',
    value: m.couplingRatio,
    threshold,
    tier: 2,
    severity: 'warning',
    message: `Coupling ratio is ${m.couplingRatio.toFixed(2)} (threshold: ${threshold})`,
  };
}

function checkTransitiveDepth(m: FileMetrics, threshold: number): CouplingViolation | null {
  if (m.transitiveDepth <= threshold) return null;
  return {
    file: m.file,
    metric: 'transitiveDependencyDepth',
    value: m.transitiveDepth,
    threshold,
    tier: 3,
    severity: 'info',
    message: `Transitive dependency depth is ${m.transitiveDepth} (threshold: ${threshold})`,
  };
}

function checkMetricViolations(
  m: FileMetrics,
  thresholds: ResolvedThresholds
): CouplingViolation[] {
  const candidates = [
    checkFanOut(m, thresholds.fanOut.warn),
    checkFanIn(m, thresholds.fanIn.info),
    checkCouplingRatio(m, thresholds.couplingRatio.warn),
    checkTransitiveDepth(m, thresholds.transitiveDependencyDepth.info),
  ];
  return candidates.filter((v): v is CouplingViolation => v !== null);
}

function checkViolations(
  metrics: FileMetrics[],
  config?: Partial<CouplingConfig>
): CouplingViolation[] {
  const thresholds = resolveThresholds(config);
  const violations: CouplingViolation[] = [];
  for (const m of metrics) {
    violations.push(...checkMetricViolations(m, thresholds));
  }
  return violations;
}

export async function detectCouplingViolations(
  snapshot: CodebaseSnapshot,
  config?: Partial<CouplingConfig>,
  graphData?: GraphCouplingData
): Promise<Result<CouplingReport, EntropyError>> {
  let metrics: FileMetrics[];

  if (graphData) {
    metrics = graphData.files.map((f) => ({
      file: f.file,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
      couplingRatio: f.couplingRatio,
      transitiveDepth: f.transitiveDepth,
    }));
  } else {
    metrics = computeMetricsFromSnapshot(snapshot);
  }

  const violations = checkViolations(metrics, config);
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const infoCount = violations.filter((v) => v.severity === 'info').length;

  return Ok({
    violations,
    stats: {
      filesAnalyzed: metrics.length,
      violationCount: violations.length,
      warningCount,
      infoCount,
    },
  });
}
