#!/usr/bin/env node
// sentinel-pre.js — PreToolUse:* hook
// Sentinel prompt injection defense — scans tool inputs for injection patterns
// and blocks destructive operations during tainted sessions.
// Exit codes: 0 = allow, 2 = block

import { readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

// Destructive tool patterns blocked during taint
const DESTRUCTIVE_BASH = [
  /\bgit\s+push\b/,
  /\bgit\s+commit\b/,
  /\brm\s+-rf?\b/,
  /\brm\s+-r\b/,
];

function isDestructiveBash(command) {
  return DESTRUCTIVE_BASH.some((p) => p.test(command));
}

function isOutsideWorkspace(filePath, workspaceRoot) {
  if (!filePath || !workspaceRoot) return false;
  const resolved = resolve(workspaceRoot, filePath);
  return !resolved.startsWith(workspaceRoot);
}

// Minimal inline patterns for when @harness-engineering/core isn't available
function inlineScan(text) {
  const findings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/[\u200B\u200C\u200D\uFEFF\u2060]/.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-UNI-001', match: line.trim(), line: i + 1 });
    }
    if (/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions?|prompts?|context)/i.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-REROL-001', match: line.trim(), line: i + 1 });
    }
  }
  return findings;
}

function extractText(toolName, toolInput) {
  if (toolName === 'Bash') return toolInput?.command ?? '';
  if (toolName === 'Write') return toolInput?.content ?? '';
  if (toolName === 'Edit') return `${toolInput?.old_string ?? ''}\n${toolInput?.new_string ?? ''}`;
  if (toolName === 'Read') return toolInput?.file_path ?? '';
  const parts = [];
  for (const value of Object.values(toolInput || {})) {
    if (typeof value === 'string') parts.push(value);
  }
  return parts.join('\n') || null;
}

async function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.exit(0);
  }

  if (!raw.trim()) {
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  try {
    const toolName = input?.tool_name ?? '';
    const toolInput = input?.tool_input ?? {};
    const sessionId = input?.session_id;
    const workspaceRoot = process.cwd();

    // Step 1: Check taint state — block destructive ops if tainted
    let tainted = false;
    try {
      const taintPath = resolve(
        workspaceRoot,
        '.harness',
        `session-taint-${sessionId || 'default'}.json`
      );
      const taintRaw = readFileSync(taintPath, 'utf-8');
      const taintState = JSON.parse(taintRaw);

      const expiresAt = new Date(taintState.expiresAt);
      if (new Date() >= expiresAt) {
        try { unlinkSync(taintPath); } catch { /* ignore */ }
        process.stderr.write(
          'Sentinel: session taint expired. Destructive operations re-enabled.\n'
        );
      } else {
        tainted = true;
      }
    } catch {
      // No taint file or malformed — not tainted
    }

    if (tainted) {
      if (toolName === 'Bash') {
        const command = toolInput?.command ?? '';
        if (isDestructiveBash(command)) {
          process.stderr.write(
            `BLOCKED by Sentinel: "${toolName}" blocked during tainted session. ` +
            `Destructive operations are restricted. Run "harness taint clear" to lift.\n`
          );
          process.exit(2);
        }
      }

      if (toolName === 'Write' || toolName === 'Edit') {
        const filePath = toolInput?.file_path ?? '';
        if (isOutsideWorkspace(filePath, workspaceRoot)) {
          process.stderr.write(
            `BLOCKED by Sentinel: "${toolName}" to "${filePath}" blocked during tainted session. ` +
            `File is outside workspace. Run "harness taint clear" to lift.\n`
          );
          process.exit(2);
        }
      }
    }

    // Step 2: Scan tool inputs for injection patterns
    const textToScan = extractText(toolName, toolInput);
    if (textToScan) {
      let findings;
      try {
        const core = await import('@harness-engineering/core');
        findings = core.scanForInjection(textToScan);
      } catch {
        findings = inlineScan(textToScan);
      }

      const actionable = findings.filter((f) => f.severity === 'high' || f.severity === 'medium');

      if (actionable.length > 0) {
        try {
          const core = await import('@harness-engineering/core');
          core.writeTaint(
            workspaceRoot,
            sessionId,
            `Injection pattern detected in PreToolUse:${toolName} input`,
            actionable,
            `PreToolUse:${toolName}`
          );
        } catch {
          // Can't write taint — log but don't block
        }

        for (const f of actionable) {
          process.stderr.write(
            `Sentinel [${f.severity}] ${f.ruleId}: detected in ${toolName} input\n`
          );
        }
      }

      const low = findings.filter((f) => f.severity === 'low');
      for (const f of low) {
        process.stderr.write(`Sentinel [low] ${f.ruleId}: ${f.match.slice(0, 80)}\n`);
      }
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
