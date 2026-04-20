#!/usr/bin/env node
/* global setTimeout, fetch, AbortSignal */
// telemetry-reporter.js — Stop:* hook
// Reads adoption.jsonl, resolves consent, sends telemetry events to PostHog,
// and shows a one-time first-run privacy notice.
// Exit codes: 0 = allow (always, log-only hook — never blocks session teardown)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

// PostHog project API key — public, write-only (cannot read data)
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY ?? 'phc_wNTdCMcfJXZPgdNeDociZW6vwoGGo4nb7vqEfWThFfsG'; // harness-ignore SEC-SEC-002: public PostHog write-only ingest key
const POSTHOG_BATCH_URL = 'https://app.posthog.com/batch';
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5000;

const FIRST_RUN_NOTICE = `Harness collects anonymous usage analytics to improve the tool.
No personal information is sent. Disable with:
  DO_NOT_TRACK=1  or  harness.config.json \u2192 telemetry.enabled: false\n`;

// --- Helpers ---

function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Consent ---

function resolveConsent(cwd) {
  if (process.env.DO_NOT_TRACK === '1') return { allowed: false };
  if (process.env.HARNESS_TELEMETRY_OPTOUT === '1') return { allowed: false };

  const config = readJsonSafe(join(cwd, 'harness.config.json'));
  if (config?.telemetry?.enabled === false) return { allowed: false };

  const installId = getOrCreateInstallId(cwd);

  const identityFile = readJsonSafe(join(cwd, '.harness', 'telemetry.json'));
  const identity = {};
  if (identityFile?.identity) {
    if (typeof identityFile.identity.project === 'string') identity.project = identityFile.identity.project;
    if (typeof identityFile.identity.team === 'string') identity.team = identityFile.identity.team;
    if (typeof identityFile.identity.alias === 'string') identity.alias = identityFile.identity.alias;
  }

  // Fallback: project name from harness.config.json
  if (!identity.project && typeof config?.name === 'string') {
    identity.project = config.name;
  }

  // Fallback: alias from git config user.name
  if (!identity.alias) {
    try {
      const gitName = execFileSync('git', ['config', 'user.name'], {
        cwd,
        encoding: 'utf-8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (gitName) identity.alias = gitName;
    } catch {
      // Git not available or no user.name set
    }
  }

  return { allowed: true, installId, identity };
}

// --- Install ID ---

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getOrCreateInstallId(cwd) {
  const harnessDir = join(cwd, '.harness');
  const installIdFile = join(harnessDir, '.install-id');

  try {
    const existing = readFileSync(installIdFile, 'utf-8').trim();
    if (UUID_V4_RE.test(existing)) return existing;
  } catch {
    // File does not exist
  }

  const id = randomUUID();
  mkdirSync(harnessDir, { recursive: true });
  writeFileSync(installIdFile, id, { encoding: 'utf-8', mode: 0o600 });
  return id;
}

// --- Collector ---

function readAdoptionRecords(cwd) {
  const adoptionFile = join(cwd, '.harness', 'metrics', 'adoption.jsonl');
  let raw;
  try {
    raw = readFileSync(adoptionFile, 'utf-8');
  } catch {
    return [];
  }

  const records = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (
        typeof parsed.skill === 'string' &&
        typeof parsed.startedAt === 'string' &&
        typeof parsed.duration === 'number' &&
        typeof parsed.outcome === 'string' &&
        Array.isArray(parsed.phasesReached)
      ) {
        records.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }
  return records;
}

function collectEvents(cwd, consent) {
  const records = readAdoptionRecords(cwd);
  if (records.length === 0) return [];

  const { installId, identity } = consent;
  const distinctId = identity.alias ?? installId;

  return records.map((record) => ({
    event: 'skill_invocation',
    distinct_id: distinctId,
    timestamp: record.startedAt,
    properties: {
      installId,
      os: process.platform,
      nodeVersion: process.version,
      harnessVersion: readHarnessVersion(cwd),
      skillName: record.skill,
      duration: record.duration,
      outcome: record.outcome === 'completed' ? 'success' : 'failure',
      phasesReached: record.phasesReached,
      ...(identity.project ? { project: identity.project } : {}),
      ...(identity.team ? { team: identity.team } : {}),
    },
  }));
}

function readHarnessVersion(cwd) {
  try {
    const pkg = readJsonSafe(join(cwd, 'node_modules', '@harness-engineering', 'core', 'package.json'));
    return pkg?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// --- Transport ---

async function sendEvents(events) {
  if (events.length === 0) return;

  const payload = JSON.stringify({ api_key: POSTHOG_API_KEY, batch: events });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(POSTHOG_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return;
      if (res.status < 500) return; // 4xx = permanent, do not retry
    } catch {
      // Network error or timeout — retry
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(1000 * (attempt + 1));
    }
  }
  // Silent failure — all retries exhausted
}

// --- First-run notice ---

function showFirstRunNotice(cwd) {
  const flagFile = join(cwd, '.harness', '.telemetry-notice-shown');
  if (existsSync(flagFile)) return;

  process.stderr.write(FIRST_RUN_NOTICE);

  try {
    mkdirSync(join(cwd, '.harness'), { recursive: true });
    writeFileSync(flagFile, new Date().toISOString(), { encoding: 'utf-8' });
  } catch {
    // Non-fatal — notice will show again next time
  }
}

// --- Main ---

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

  // Parse stdin (stop hook receives session JSON)
  try {
    JSON.parse(raw);
  } catch {
    process.stderr.write('[telemetry-reporter] Could not parse stdin — skipping\n');
    process.exit(0);
  }

  try {
    const cwd = process.cwd();
    const consent = resolveConsent(cwd);

    if (!consent.allowed) {
      process.exit(0);
    }

    // Show first-run notice (before sending, so user sees it even if send fails)
    showFirstRunNotice(cwd);

    const events = collectEvents(cwd, consent);
    if (events.length === 0) {
      process.stderr.write('[telemetry-reporter] No adoption records to report\n');
      process.exit(0);
    }

    await sendEvents(events);

    // Truncate adoption.jsonl after successful send to prevent re-sending
    const adoptionFile = join(cwd, '.harness', 'metrics', 'adoption.jsonl');
    try {
      writeFileSync(adoptionFile, '', 'utf-8');
    } catch {
      // Non-fatal — records may be re-sent next session
    }

    process.stderr.write(`[telemetry-reporter] Sent ${events.length} telemetry event(s)\n`);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[telemetry-reporter] Failed: ${err.message}\n`);
    process.exit(0);
  }
}

main();
