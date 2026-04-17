import * as path from 'path';
import { execSync } from 'child_process';
import { sanitizePath } from '../utils/sanitize-path.js';

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
    },
    required: ['path'],
  },
};

export async function handleRunSecurityScan(input: {
  path: string;
  files?: string[];
  strict?: boolean;
}) {
  try {
    const core = await import('@harness-engineering/core');

    const projectRoot = sanitizePath(input.path);

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
      // Use core's glob utility to find source files
      const { globFiles } = await import('../utils/glob-helper.js');
      filesToScan = await globFiles(projectRoot, securityConfig.exclude as string[] | undefined);
    }

    const result = await scanner.scanFiles(filesToScan);

    // Best-effort timeline capture — never break the scan response
    try {
      const commitHash = execSync('git rev-parse HEAD', {
        cwd: projectRoot,
        encoding: 'utf-8',
      }).trim();
      const timelineManager = new core.SecurityTimelineManager(projectRoot);
      timelineManager.capture(result, commitHash);
      timelineManager.updateLifecycles(result.findings, commitHash);
    } catch {
      // Timeline capture is best-effort
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            ...result,
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
