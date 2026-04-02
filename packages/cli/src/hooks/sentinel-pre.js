#!/usr/bin/env node
/* global console */
// sentinel-pre.js — PreToolUse:* hook
// Sentinel prompt injection defense — scans tool inputs for injection patterns
// and blocks destructive operations during tainted sessions.
// Exit codes: 0 = allow, 2 = block

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import process from 'node:process';

function readStdinSync() {
  return readFileSync(process.platform === 'win32' ? 0 : '/dev/stdin', 'utf-8');
}

// Destructive tool patterns blocked during taint.
// These are intentionally inline — this check runs before the @harness-engineering/core
// import attempt to ensure enforcement even when core is unavailable.
// Keep in sync with DESTRUCTIVE_BASH exported from @harness-engineering/core injection-patterns.ts.
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
  // Resolve symlinks to prevent bypass via symlink pointing outside workspace
  let realResolved = resolved;
  try { realResolved = realpathSync(resolved); } catch { /* path doesn't exist yet — use resolved */ }
  return !realResolved.startsWith(workspaceRoot);
}

// Minimal inline patterns for when @harness-engineering/core isn't available.
// Keep in sync with @harness-engineering/core injection-patterns.ts ALL_PATTERNS.
// Covers all HIGH-severity patterns and key MEDIUM patterns for degraded-mode safety.
function inlineScan(text) {
  console.error('[sentinel] Running in degraded mode: core import failed, using inline patterns');
  const findings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // HIGH: INJ-UNI-001 — Zero-width characters
    // eslint-disable-next-line no-misleading-character-class -- intentional: detects zero-width chars for security
    if (/[\u200B\u200C\u200D\uFEFF\u2060]/.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-UNI-001', match: line.trim(), line: i + 1 });
    }
    // HIGH: INJ-UNI-002 — RTL/LTR override characters
    if (/[\u202A-\u202E\u2066-\u2069]/.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-UNI-002', match: line.trim(), line: i + 1 });
    }
    // HIGH: INJ-REROL-001 — Ignore previous instructions
    if (/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|context|rules?|guidelines?)/i.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-REROL-001', match: line.trim(), line: i + 1 });
    }
    // HIGH: INJ-REROL-002 — Role reassignment
    if (/you\s+are\s+now\s+(?:a\s+|an\s+)?(?:new\s+)?(?:helpful\s+)?(?:my\s+)?(?:\w+\s+)?(?:assistant|agent|AI|bot|chatbot|system|persona)\b/i.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-REROL-002', match: line.trim(), line: i + 1 });
    }
    // HIGH: INJ-REROL-003 — Direct instruction override
    if (/(?:new\s+)?(?:system\s+)?(?:instruction|directive|role|persona)\s*[:=]\s*/i.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-REROL-003', match: line.trim(), line: i + 1 });
    }
    // HIGH: INJ-PERM-001 — Enable all tools/permissions
    if (/(?:allow|enable|grant)\s+all\s+(?:tools?|permissions?|access)/i.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-PERM-001', match: line.trim(), line: i + 1 });
    }
    // HIGH: INJ-PERM-002 — Disable safety/security
    if (/(?:disable|turn\s+off|remove|bypass)\s+(?:all\s+)?(?:safety|security|restrictions?|guardrails?|protections?|checks?)/i.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-PERM-002', match: line.trim(), line: i + 1 });
    }
    // HIGH: INJ-PERM-003 — Auto-approve directive
    if (/(?:auto[- ]?approve|--no-verify|--dangerously-skip-permissions)/i.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-PERM-003', match: line.trim(), line: i + 1 });
    }
    // HIGH: INJ-ENC-001 — Suspicious base64
    if (/(?<!Bearer\s)(?<![:])(?<![A-Za-z0-9/])(?!eyJ)(?:[A-Za-z0-9+/]{4}){7,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?![A-Za-z0-9/])/.test(line)) {
      findings.push({ severity: 'high', ruleId: 'INJ-ENC-001', match: line.trim(), line: i + 1 });
    }
    // MEDIUM: INJ-CTX-001 — System prompt claims
    if (/(?:the\s+)?(?:system\s+prompt|system\s+message|hidden\s+instructions?)\s+(?:says?|tells?|instructs?|contains?|is)/i.test(line)) {
      findings.push({ severity: 'medium', ruleId: 'INJ-CTX-001', match: line.trim(), line: i + 1 });
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
    raw = readStdinSync();
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
          // Fallback inline taint writer — merges with existing taint state
          try {
            const id = sessionId || 'default';
            const taintPath = resolve(workspaceRoot, '.harness', `session-taint-${id}.json`);
            mkdirSync(dirname(taintPath), { recursive: true });
            const now = new Date().toISOString();
            const maxSev = actionable.some((f) => f.severity === 'high') ? 'high' : 'medium';
            const newFindings = actionable.map((f) => ({
              ruleId: f.ruleId, severity: f.severity, match: f.match,
              source: `PreToolUse:${toolName}`, detectedAt: now,
            }));
            // Read and merge existing taint state to preserve earlier taintedAt and findings
            let existing = null;
            try { existing = JSON.parse(readFileSync(taintPath, 'utf-8')); } catch { /* no existing */ }
            const state = {
              sessionId: id,
              taintedAt: existing?.taintedAt ?? now,
              expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              reason: existing?.reason ?? `Injection pattern detected in PreToolUse:${toolName} input`,
              severity: maxSev,
              findings: [...(existing?.findings ?? []), ...newFindings],
            };
            writeFileSync(taintPath, JSON.stringify(state, null, 2) + '\n');
          } catch { /* best-effort */ }
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
