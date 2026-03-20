import * as path from 'path';
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
