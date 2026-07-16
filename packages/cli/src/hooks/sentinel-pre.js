#!/usr/bin/env node
// sentinel-pre.js — PreToolUse:* hook
// Sentinel ENFORCEMENT: blocks destructive operations during an already-tainted
// session. Taint is set exclusively by sentinel-post from untrusted tool OUTPUT
// (the actual prompt-injection vector). This hook performs NO injection detection
// on tool INPUTS — an agent's own tool inputs are its intent, not untrusted content,
// and scanning them here falsely tainted legitimate work (e.g. an agent running
// harness-ignore SEC-AGT-006: this hook's design doc references the bypass flag it guards against
// `git commit --no-verify`, or inputs containing base64/git-SHA tokens), then blocked
// the agent's own `git push`. Detection lives in sentinel-post; pre only enforces.
// Exit codes: 0 = allow, 2 = block
//
// Design contract: see packages/cli/src/hooks/profiles.ts — "sentinel-pre (exit-2
// blocks a destructive op in an already-tainted session) and sentinel-post
// (detection only)".

import { readFileSync, unlinkSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

// Destructive tool patterns blocked during taint.
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

/** Read stdin (fd 0) and parse it as JSON. Returns null when it should exit-0. */
function readStdinJson() {
  let raw;
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    return null;
  }
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Determine whether the session is currently tainted. Deletes and reports an
 * expired taint file as a side effect (behavior preserved from inline logic).
 */
function isSessionTainted(workspaceRoot, sessionId) {
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
      return false;
    }
    return true;
  } catch {
    // No taint file or malformed — not tainted
    return false;
  }
}

/**
 * Enforce taint restrictions for the given tool. Exits 2 (block) when a
 * destructive Bash command or an out-of-workspace Write/Edit is attempted.
 */
function enforceTaint(toolName, toolInput, workspaceRoot) {
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

async function main() {
  const input = readStdinJson();
  if (input === null) {
    process.exit(0);
  }

  try {
    const toolName = input?.tool_name ?? '';
    const toolInput = input?.tool_input ?? {};
    const sessionId = input?.session_id;
    const workspaceRoot = process.cwd();

    // Check taint state — block destructive ops if the session is already tainted.
    // Taint is written only by sentinel-post (from untrusted tool OUTPUT).
    if (isSessionTainted(workspaceRoot, sessionId)) {
      enforceTaint(toolName, toolInput, workspaceRoot);
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

main();
