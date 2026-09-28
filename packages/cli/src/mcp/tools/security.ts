import * as path from 'path';
import { execSync } from 'child_process';
import type { SupplyChainSnapshot } from '@harness-engineering/core';
import { sanitizePath } from '../utils/sanitize-path.js';
import { loadAnalysisExclude } from '../../config/analysis-schema.js';

// ============ run_security_scan ============

export const runSecurityScanDefinition = {
  name: 'run_security_scan',
  description:
    'Run the built-in security scanner on a project or specific files. Detects secrets, injection, XSS, weak crypto, and other vulnerabilities.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of specific files to scan. If omitted, scans all source files.',
      },
      strict: {
        type: 'boolean',
        description: 'Override strict mode — promotes all warnings to errors',
      },
      supplyChainJson: {
        type: 'string',
        description:
          'Optional path (relative to the project root) to an externally-measured dependency audit JSON of { critical, high, moderate, low, info, total, packagesScanned? }, recorded in the security timeline instead of all-zero supply-chain counts. Invalid input is an error.',
      },
    },
    required: ['path'],
  },
};

export async function handleRunSecurityScan(input: {
  path: string;
  files?: string[];
  strict?: boolean;
  supplyChainJson?: string;
}) {
  try {
    const core = await import('@harness-engineering/core');

    const projectRoot = sanitizePath(input.path);

    // Mirrors `check-security --supply-chain-json`: validate before scanning and
    // fail loudly, never substituting the all-zero default for a bad measurement.
    let supplyChain: SupplyChainSnapshot | undefined;
    if (input.supplyChainJson !== undefined) {
      const measurement = core.readSupplyChainMeasurement(
        path.resolve(projectRoot, input.supplyChainJson)
      );
      if (!measurement.ok) throw measurement.error;
      supplyChain = measurement.value;
    }

    // Load config from project
    let configData: Record<string, unknown> = {};
    try {
      const fs = await import('node:fs');
      const configPath = path.join(projectRoot, 'harness.config.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        configData = (parsed.security as Record<string, unknown>) ?? {};
      }
    } catch {
      // No config file — use defaults
    }

    // Apply overrides
    if (input.strict !== undefined) {
      configData.strict = input.strict;
    }

    const securityConfig = core.parseSecurityConfig(configData);
    const scanner = new core.SecurityScanner(securityConfig);
    scanner.configureForProject(projectRoot);

    let filesToScan: string[];

    if (input.files && input.files.length > 0) {
      filesToScan = input.files.map((f: string) => path.resolve(projectRoot, f));
    } else {
      // Use core's glob utility to find source files. Project-wide
      // analysis.exclude globs apply on top of security-specific excludes.
      const { globFiles } = await import('../utils/glob-helper.js');
      filesToScan = await globFiles(projectRoot, [
        ...((securityConfig.exclude as string[] | undefined) ?? []),
        ...loadAnalysisExclude(projectRoot),
      ]);
    }

    const result = await scanner.scanFiles(filesToScan);

    // Best-effort timeline capture for the scan alone; a supplied measurement the
    // caller asked to record must not be dropped silently.
    try {
      const commitHash = execSync('git rev-parse HEAD', {
        cwd: projectRoot,
        encoding: 'utf-8',
      }).trim();
      const timelineManager = new core.SecurityTimelineManager(projectRoot);
      timelineManager.capture(result, commitHash, supplyChain);
      timelineManager.updateLifecycles(result.findings, commitHash);
    } catch (error) {
      if (supplyChain !== undefined) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Supply-chain measurement was not recorded in the security timeline: ${reason}`,
          { cause: error }
        );
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            ...result,
            ...(supplyChain !== undefined && { supplyChain }),
            summary: {
              errors: result.findings.filter((f: { severity: string }) => f.severity === 'error')
                .length,
              warnings: result.findings.filter(
                (f: { severity: string }) => f.severity === 'warning'
              ).length,
              info: result.findings.filter((f: { severity: string }) => f.severity === 'info')
                .length,
            },
          }),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// ============ get_security_trends ============

export const getSecurityTrendsDefinition = {
  name: 'get_security_trends',
  description:
    'Get security posture trends showing how security score, findings, and supply chain metrics are changing over time.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      last: {
        type: 'number',
        description: 'Return trends from the last N snapshots',
      },
      since: {
        type: 'string',
        description: 'Return trends since this ISO date (e.g. 2025-01-01)',
      },
    },
    required: ['path'],
  },
};

export async function handleGetSecurityTrends(input: {
  path: string;
  last?: number;
  since?: string;
}) {
  try {
    const core = await import('@harness-engineering/core');

    const projectRoot = sanitizePath(input.path);
    const manager = new core.SecurityTimelineManager(projectRoot);
    const trendOptions: { last?: number; since?: string } = {};
    if (input.last !== undefined) trendOptions.last = input.last;
    if (input.since !== undefined) trendOptions.since = input.since;
    const trends = manager.trends(trendOptions);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(trends),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
