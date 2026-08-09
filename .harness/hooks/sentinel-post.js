#!/usr/bin/env node
/* global console */
// sentinel-post.js — PostToolUse:* hook
// Sentinel prompt injection defense — scans tool outputs for injection patterns.
// Exit codes: always 0 (PostToolUse cannot block)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import process from 'node:process';
import { readHookStdin } from './read-hook-stdin.js';

// Minimal inline patterns for when @harness-engineering/core isn't available.
// Keep in sync with @harness-engineering/core injection-patterns.ts ALL_PATTERNS.
// Covers all HIGH-severity patterns and key MEDIUM patterns for degraded-mode safety.
//
// Rules are declared as a data table and applied in order, one regex per line.
// This is a pure structural extraction of the original per-rule `if` blocks —
// every rule's pattern, severity, ruleId, and ordering is byte-for-byte preserved.
const INLINE_RULES = [
  // HIGH: INJ-UNI-001 — Zero-width characters
  // eslint-disable-next-line no-misleading-character-class -- intentional: detects zero-width chars for security
  { severity: 'high', ruleId: 'INJ-UNI-001', pattern: /[\u200B\u200C\u200D\uFEFF\u2060]/ },
  // HIGH: INJ-UNI-002 — RTL/LTR override characters
  { severity: 'high', ruleId: 'INJ-UNI-002', pattern: /[\u202A-\u202E\u2066-\u2069]/ },
  // HIGH: INJ-REROL-001 — Ignore previous instructions
  { severity: 'high', ruleId: 'INJ-REROL-001', pattern: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|context|rules?|guidelines?)/i },
  // HIGH: INJ-REROL-002 — Role reassignment
  { severity: 'high', ruleId: 'INJ-REROL-002', pattern: /you\s+are\s+now\s+(?:a\s+|an\s+)?(?:new\s+)?(?:helpful\s+)?(?:my\s+)?(?:\w+\s+)?(?:assistant|agent|AI|bot|chatbot|system|persona)\b/i },
  // HIGH: INJ-REROL-003 — Direct instruction override
  { severity: 'high', ruleId: 'INJ-REROL-003', pattern: /(?:new\s+)?(?:system\s+)?(?:instruction|directive|role|persona)\s*[:=]\s*/i },
  // HIGH: INJ-PERM-001 — Enable all tools/permissions
  { severity: 'high', ruleId: 'INJ-PERM-001', pattern: /(?:allow|enable|grant)\s+all\s+(?:tools?|permissions?|access)/i },
  // HIGH: INJ-PERM-002 — Disable safety/security
  { severity: 'high', ruleId: 'INJ-PERM-002', pattern: /(?:disable|turn\s+off|remove|bypass)\s+(?:all\s+)?(?:safety|security|restrictions?|guardrails?|protections?|checks?)/i },
  // HIGH: INJ-PERM-003 — Auto-approve directive
  // harness-ignore SEC-AGT-006: definitional — this IS the detection pattern for the bypass flags
  { severity: 'high', ruleId: 'INJ-PERM-003', pattern: /(?:auto[- ]?approve|--no-verify|--dangerously-skip-permissions)/i },
  // HIGH: INJ-ENC-001 — Suspicious base64
  { severity: 'high', ruleId: 'INJ-ENC-001', pattern: /(?<!Bearer\s)(?<![:])(?<![A-Za-z0-9/])(?!eyJ)(?:[A-Za-z0-9+/]{4}){7,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?![A-Za-z0-9/])/ },
  // MEDIUM: INJ-CTX-001 — System prompt claims
  { severity: 'medium', ruleId: 'INJ-CTX-001', pattern: /(?:the\s+)?(?:system\s+prompt|system\s+message|hidden\s+instructions?)\s+(?:says?|tells?|instructs?|contains?|is)/i },
];

/** Apply every inline rule to one line, appending findings in rule order. */
function scanLine(line, lineNumber, findings) {
  for (const rule of INLINE_RULES) {
    if (rule.pattern.test(line)) {
      findings.push({
        severity: rule.severity,
        ruleId: rule.ruleId,
        match: line.trim(),
        line: lineNumber,
      });
    }
  }
}

function inlineScan(text) {
  console.error('[sentinel] Running in degraded mode: core import failed, using inline patterns');
  const findings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    scanLine(lines[i], i + 1, findings);
  }
  return findings;
}

/** Read stdin (fd 0) and parse it as JSON. Returns null when it should exit-0. */
function readStdinJson() {
  // readHookStdin retries the EAGAIN that fd 0 throws under compound load (v8
  // coverage on the pre-push gate): the writer races ahead of the read, and a
  // raw readFileSync(0) would mistake that backpressure for empty stdin and
  // fail-open, flaking the suite (#620). A genuine read failure or empty stdin
  // still returns null (fail-open — PostToolUse cannot block anyway).
  const stdin = readHookStdin();
  if (!stdin.ok || !stdin.data.trim()) return null;
  try {
    return JSON.parse(stdin.data);
  } catch {
    return null;
  }
}

/** Run injection detection via core, falling back to inline patterns. */
async function detectFindings(toolOutput) {
  try {
    const core = await import('@harness-engineering/core');
    return core.scanForInjection(toolOutput);
  } catch {
    return inlineScan(toolOutput);
  }
}

/**
 * Fallback inline taint writer — merges with existing taint state.
 * Used only when @harness-engineering/core.writeTaint is unavailable.
 */
function writeTaintFallback(workspaceRoot, sessionId, toolName, actionable) {
  try {
    const id = sessionId || 'default';
    const taintPath = resolve(workspaceRoot, '.harness', `session-taint-${id}.json`);
    mkdirSync(dirname(taintPath), { recursive: true });
    const now = new Date().toISOString();
    const maxSev = actionable.some((f) => f.severity === 'high') ? 'high' : 'medium';
    const newFindings = actionable.map((f) => ({
      ruleId: f.ruleId, severity: f.severity, match: f.match,
      source: `PostToolUse:${toolName}`, detectedAt: now,
    }));
    // Read and merge existing taint state to preserve earlier taintedAt and findings
    let existing = null;
    try { existing = JSON.parse(readFileSync(taintPath, 'utf-8')); } catch { /* no existing */ }
    const state = {
      sessionId: id,
      taintedAt: existing?.taintedAt ?? now,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      reason: existing?.reason ?? `Injection pattern detected in PostToolUse:${toolName} result`,
      severity: maxSev,
      findings: [...(existing?.findings ?? []), ...newFindings],
    };
    writeFileSync(taintPath, JSON.stringify(state, null, 2) + '\n');
  } catch { /* best-effort */ }
}

/** Persist taint via core.writeTaint, falling back to the inline writer. */
async function recordTaint(workspaceRoot, sessionId, toolName, actionable) {
  try {
    const core = await import('@harness-engineering/core');
    core.writeTaint(
      workspaceRoot,
      sessionId,
      `Injection pattern detected in PostToolUse:${toolName} result`,
      actionable,
      `PostToolUse:${toolName}`
    );
  } catch {
    writeTaintFallback(workspaceRoot, sessionId, toolName, actionable);
  }
}

/** Emit stderr lines for actionable (high/medium) and low findings. */
function reportFindings(findings, actionable, toolName) {
  for (const f of actionable) {
    process.stderr.write(
      `Sentinel [${f.severity}] ${f.ruleId}: detected in ${toolName} output\n`
    );
  }
  const low = findings.filter((f) => f.severity === 'low');
  for (const f of low) {
    process.stderr.write(`Sentinel [low] ${f.ruleId}: ${f.match.slice(0, 80)}\n`);
  }
}

async function main() {
  const input = readStdinJson();
  if (input === null) {
    process.exit(0);
  }

  try {
    const toolName = input?.tool_name ?? '';
    const toolOutput = input?.tool_output ?? '';
    const sessionId = input?.session_id;
    const workspaceRoot = process.cwd();

    if (!toolOutput || typeof toolOutput !== 'string') {
      process.exit(0);
    }

    const findings = await detectFindings(toolOutput);
    const actionable = findings.filter((f) => f.severity === 'high' || f.severity === 'medium');

    if (actionable.length > 0) {
      await recordTaint(workspaceRoot, sessionId, toolName, actionable);
    }

    reportFindings(findings, actionable, toolName);

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
