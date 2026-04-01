#!/usr/bin/env node
/* global console */
// sentinel-post.js — PostToolUse:* hook
// Sentinel prompt injection defense — scans tool outputs for injection patterns.
// Exit codes: always 0 (PostToolUse cannot block)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import process from 'node:process';

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
    const toolOutput = input?.tool_output ?? '';
    const sessionId = input?.session_id;
    const workspaceRoot = process.cwd();

    if (!toolOutput || typeof toolOutput !== 'string') {
      process.exit(0);
    }

    let findings;
    try {
      const core = await import('@harness-engineering/core');
      findings = core.scanForInjection(toolOutput);
    } catch {
      findings = inlineScan(toolOutput);
    }

    const actionable = findings.filter((f) => f.severity === 'high' || f.severity === 'medium');

    if (actionable.length > 0) {
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
        // Fallback inline taint writer — merges with existing taint state
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

      for (const f of actionable) {
        process.stderr.write(
          `Sentinel [${f.severity}] ${f.ruleId}: detected in ${toolName} output\n`
        );
      }
    }

    const low = findings.filter((f) => f.severity === 'low');
    for (const f of low) {
      process.stderr.write(`Sentinel [low] ${f.ruleId}: ${f.match.slice(0, 80)}\n`);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
