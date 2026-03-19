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

function checkViolations(
  metrics: FileMetrics[],
  config?: Partial<CouplingConfig>
): CouplingViolation[] {
  const thresholds = {
    fanOut: { ...DEFAULT_THRESHOLDS.fanOut, ...config?.thresholds?.fanOut },
    fanIn: { ...DEFAULT_THRESHOLDS.fanIn, ...config?.thresholds?.fanIn },
    couplingRatio: { ...DEFAULT_THRESHOLDS.couplingRatio, ...config?.thresholds?.couplingRatio },
    transitiveDependencyDepth: {
      ...DEFAULT_THRESHOLDS.transitiveDependencyDepth,
      ...config?.thresholds?.transitiveDependencyDepth,
    },
  };

  const violations: CouplingViolation[] = [];

  for (const m of metrics) {
    if (thresholds.fanOut.warn !== undefined && m.fanOut > thresholds.fanOut.warn) {
      violations.push({
        file: m.file,
        metric: 'fanOut',
        value: m.fanOut,
        threshold: thresholds.fanOut.warn,
        tier: 2,
        severity: 'warning',
        message: `File has ${m.fanOut} imports (threshold: ${thresholds.fanOut.warn})`,
      });
    }

    if (thresholds.fanIn.info !== undefined && m.fanIn > thresholds.fanIn.info) {
      violations.push({
        file: m.file,
        metric: 'fanIn',
        value: m.fanIn,
        threshold: thresholds.fanIn.info,
        tier: 3,
        severity: 'info',
        message: `File is imported by ${m.fanIn} files (threshold: ${thresholds.fanIn.info})`,
      });
    }

    const totalConnections = m.fanIn + m.fanOut;
    if (
      totalConnections > 5 &&
      thresholds.couplingRatio.warn !== undefined &&
      m.couplingRatio > thresholds.couplingRatio.warn
    ) {
      violations.push({
        file: m.file,
        metric: 'couplingRatio',
        value: m.couplingRatio,
        threshold: thresholds.couplingRatio.warn,
        tier: 2,
        severity: 'warning',
        message: `Coupling ratio is ${m.couplingRatio.toFixed(2)} (threshold: ${thresholds.couplingRatio.warn})`,
      });
    }

    if (
      thresholds.transitiveDependencyDepth.info !== undefined &&
      m.transitiveDepth > thresholds.transitiveDependencyDepth.info
    ) {
      violations.push({
        file: m.file,
        metric: 'transitiveDependencyDepth',
        value: m.transitiveDepth,
        threshold: thresholds.transitiveDependencyDepth.info,
        tier: 3,
        severity: 'info',
        message: `Transitive dependency depth is ${m.transitiveDepth} (threshold: ${thresholds.transitiveDependencyDepth.info})`,
      });
    }
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
