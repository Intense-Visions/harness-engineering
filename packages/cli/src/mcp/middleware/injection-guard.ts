/**
 * Sentinel MCP Injection Guard Middleware
 *
 * Wraps MCP tool handlers with pre/post injection scanning.
 * Provides Gemini CLI parity with the Claude Code sentinel hooks.
 *
 * - Pre: scans tool input parameters; if tainted session + destructive tool, returns error
 * - Post: scans tool result content; if findings, sets taint and appends warning
 * - Fail-open: middleware errors pass through to the original handler
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  scanForInjection,
  writeTaint,
  checkTaint,
  DESTRUCTIVE_BASH,
  type InjectionFinding,
} from '@harness-engineering/core';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Source of truth for DESTRUCTIVE_BASH is @harness-engineering/core injection-patterns.ts.
 */
function isDestructiveBash(command: string): boolean {
  return DESTRUCTIVE_BASH.some((p) => p.test(command));
}

function isOutsideWorkspace(filePath: string, workspaceRoot: string): boolean {
  if (!filePath || !workspaceRoot) return false;
  const resolved = resolve(workspaceRoot, filePath);
  // Resolve symlinks to prevent bypass via symlink pointing outside workspace
  let realResolved = resolved;
  try {
    realResolved = realpathSync(resolved);
  } catch {
    /* path doesn't exist yet — use resolved */
  }
  return !realResolved.startsWith(workspaceRoot);
}

/** Per-tool input field extractors. */
const INPUT_EXTRACTORS: Record<string, (input: Record<string, unknown>) => string> = {
  Bash: (input) => (input?.command as string) ?? '',
  Write: (input) => (input?.content as string) ?? '',
  Edit: (input) => `${(input?.old_string as string) ?? ''}\n${(input?.new_string as string) ?? ''}`,
  Read: (input) => (input?.file_path as string) ?? '',
};

/**
 * Extract scannable text from MCP tool input arguments.
 * Mirrors the sentinel-pre.js extractText function.
 */
function extractInputText(toolName: string, toolInput: Record<string, unknown>): string | null {
  const extractor = INPUT_EXTRACTORS[toolName];
  if (extractor) return extractor(toolInput);

  // Generic: concatenate all string values
  const parts = Object.values(toolInput || {}).filter((v): v is string => typeof v === 'string');
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Extract scannable text from tool result content.
 */
function extractResultText(result: ToolResult): string {
  return result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

/**
 * Check if a tool invocation is destructive (blocked during taint).
 * Maps MCP tool names to their hook equivalents.
 */
function isDestructiveOperation(
  toolName: string,
  toolInput: Record<string, unknown>,
  workspaceRoot: string
): boolean {
  // MCP tools use snake_case names; also handle PascalCase for direct tool names
  const normalized = toolName.toLowerCase().replace(/_/g, '');

  if (normalized === 'bash') {
    const command = (toolInput?.command as string) ?? '';
    return isDestructiveBash(command);
  }

  if (normalized === 'write' || normalized === 'edit') {
    const filePath = (toolInput?.file_path as string) ?? '';
    return isOutsideWorkspace(filePath, workspaceRoot);
  }

  return false;
}

export interface InjectionGuardOptions {
  /** Project root for taint file storage. Defaults to process.cwd(). */
  projectRoot?: string;
  /** Session ID for taint scoping. Defaults to "default". */
  sessionId?: string;
  /**
   * Tool names whose output is trusted internal content (e.g., skill docs,
   * project state). Output scanning is skipped for these tools to prevent
   * false positives. Input scanning still applies.
   */
  trustedOutputTools?: Set<string>;
}

/**
 * Wrap a single MCP tool handler with injection guard middleware.
 *
 * The returned handler:
 * 1. Checks taint state -- blocks destructive tools if tainted
 * 2. Scans tool input for injection patterns -- taints on HIGH/MEDIUM findings
 * 3. Calls the original handler
 * 4. Scans tool output for injection patterns -- taints on HIGH/MEDIUM findings
 * 5. Fails open on any middleware error
 */
export function wrapWithInjectionGuard(
  toolName: string,
  handler: ToolHandler,
  options: InjectionGuardOptions = {}
): ToolHandler {
  const projectRoot = options.projectRoot ?? process.cwd();
  const sessionId = options.sessionId ?? 'default';
  const trustedOutput = options.trustedOutputTools?.has(toolName) ?? false;

  return async (input: Record<string, unknown>): Promise<ToolResult> => {
    try {
      // Step 1: Check taint state -- block destructive ops if tainted
      const taintCheck = checkTaint(projectRoot, sessionId);
      if (taintCheck.tainted && isDestructiveOperation(toolName, input, projectRoot)) {
        return {
          content: [
            {
              type: 'text',
              text:
                `BLOCKED by Sentinel: "${toolName}" blocked during tainted session. ` +
                `Destructive operations are restricted. Run "harness taint clear" to lift.`,
            },
          ],
          isError: true,
        };
      }

      // Step 2: Scan tool inputs for injection patterns
      const textToScan = extractInputText(toolName, input);
      if (textToScan) {
        const findings = scanForInjection(textToScan);
        const actionable = findings.filter(
          (f: InjectionFinding) => f.severity === 'high' || f.severity === 'medium'
        );

        if (actionable.length > 0) {
          writeTaint(
            projectRoot,
            sessionId,
            `Injection pattern detected in MCP:${toolName} input`,
            actionable,
            `MCP:${toolName}`
          );
        }
      }

      // Step 3: Call original handler
      const result = await handler(input);

      // Step 4: Scan tool output for injection patterns (skip trusted internal tools)
      if (!trustedOutput) {
        const outputText = extractResultText(result);
        if (outputText) {
          const outputFindings = scanForInjection(outputText);
          const actionableOutput = outputFindings.filter(
            (f: InjectionFinding) => f.severity === 'high' || f.severity === 'medium'
          );

          if (actionableOutput.length > 0) {
            writeTaint(
              projectRoot,
              sessionId,
              `Injection pattern detected in MCP:${toolName} result`,
              actionableOutput,
              `MCP:${toolName}:output`
            );

            // Append warning to result
            const warningLines = actionableOutput.map(
              (f: InjectionFinding) =>
                `Sentinel [${f.severity}] ${f.ruleId}: detected in ${toolName} output`
            );
            result.content.push({
              type: 'text',
              text: `\n---\nSentinel Warning: ${warningLines.join('; ')}`,
            });
          }
        }
      }

      return result;
    } catch {
      // Fail-open: middleware errors pass through to the original handler
      return handler(input);
    }
  };
}

/**
 * Wrap all tool handlers in a handlers map with injection guard middleware.
 */
export function applyInjectionGuard(
  handlers: Record<string, ToolHandler>,
  options: InjectionGuardOptions = {}
): Record<string, ToolHandler> {
  const wrapped: Record<string, ToolHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = wrapWithInjectionGuard(name, handler, options);
  }
  return wrapped;
}
