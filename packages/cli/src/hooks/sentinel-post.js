#!/usr/bin/env node
// sentinel-post.js — PostToolUse:* hook
// Sentinel prompt injection defense — scans tool outputs for injection patterns.
// Exit codes: always 0 (PostToolUse cannot block)

import { readFileSync } from 'node:fs';
import process from 'node:process';

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
        // Can't write taint — log but continue
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
