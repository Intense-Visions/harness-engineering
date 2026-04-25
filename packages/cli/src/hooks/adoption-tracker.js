#!/usr/bin/env node
// adoption-tracker.js — Stop:* hook
// Reads .harness/events.jsonl, reconstructs skill invocations,
// appends SkillInvocationRecord entries to .harness/metrics/adoption.jsonl.
// Exit codes: 0 = allow (always, log-only hook)

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const ADOPTION_CURSOR_FILE = '.adoption-cursor';

/** Read and parse a JSON file, returning null on any error. */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Check if adoption tracking is enabled in harness.config.json. */
function isAdoptionEnabled(cwd) {
  const config = readJsonSafe(join(cwd, 'harness.config.json'));
  if (!config) return true; // default: enabled
  if (config.adoption && config.adoption.enabled === false) return false;
  return true;
}

/** Read the cursor offset for events.jsonl processing. */
function readEventsCursor(cwd) {
  try {
    const data = JSON.parse(readFileSync(join(cwd, '.harness', 'metrics', ADOPTION_CURSOR_FILE), 'utf-8'));
    return typeof data.offset === 'number' ? data.offset : 0;
  } catch {
    return 0;
  }
}

/** Save the cursor offset after processing events. */
function writeEventsCursor(cwd, offset) {
  const metricsDir = join(cwd, '.harness', 'metrics');
  mkdirSync(metricsDir, { recursive: true });
  writeFileSync(join(metricsDir, ADOPTION_CURSOR_FILE), JSON.stringify({ offset }) + '\n');
}

/** Parse events from a content string. Skips malformed lines. */
function parseEventsContent(content) {
  const events = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.skill && parsed.type && parsed.timestamp) {
        events.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }
  return events;
}

/** Relevant event types for adoption tracking. */
const RELEVANT_TYPES = new Set(['phase_transition', 'gate_result', 'handoff', 'error']);

/** Derive outcome from a skill's events. */
function deriveOutcome(events) {
  const hasHandoff = events.some((e) => e.type === 'handoff');
  const hasError = events.some((e) => e.type === 'error');

  // Check for final phase (VALIDATE is the conventional final phase)
  const phases = events
    .filter((e) => e.type === 'phase_transition')
    .map((e) => (e.data && e.data.to) || '')
    .filter(Boolean);
  const hasFinalPhase = phases.some(
    (p) => p.toLowerCase() === 'validate' || p.toLowerCase() === 'complete'
  );

  if (hasHandoff || hasFinalPhase) return 'completed';
  if (hasError) return 'failed';
  return 'abandoned';
}

/** Derive phases reached from phase_transition events. */
function derivePhasesReached(events) {
  const phases = [];
  const seen = new Set();
  for (const event of events) {
    if (event.type === 'phase_transition' && event.data && event.data.to) {
      const phase = event.data.to;
      if (!seen.has(phase)) {
        seen.add(phase);
        phases.push(phase);
      }
    }
  }
  return phases;
}

/** Derive duration in ms from first to last event timestamp. */
function deriveDuration(events) {
  if (events.length < 2) return 0;
  const timestamps = events.map((e) => new Date(e.timestamp).getTime()).filter((t) => !isNaN(t));
  if (timestamps.length < 2) return 0;
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  return max - min;
}

function main() {
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
    process.stderr.write('[adoption-tracker] Could not parse stdin — skipping\n');
    process.exit(0);
  }

  try {
    const cwd = process.cwd();

    // Check config
    if (!isAdoptionEnabled(cwd)) {
      process.stderr.write('[adoption-tracker] Adoption tracking disabled — skipping\n');
      process.exit(0);
    }

    // Read events.jsonl
    const eventsPath = join(cwd, '.harness', 'events.jsonl');
    if (!existsSync(eventsPath)) {
      process.stderr.write('[adoption-tracker] No events.jsonl found — skipping\n');
      process.exit(0);
    }

    const fullContent = readFileSync(eventsPath, 'utf-8');
    const cursor = readEventsCursor(cwd);
    // If file shrank (was manually reset), reprocess from start
    const effectiveCursor = cursor > fullContent.length ? 0 : cursor;
    const newContent = fullContent.slice(effectiveCursor);

    if (!newContent.trim()) {
      process.stderr.write('[adoption-tracker] No new events since last run — skipping\n');
      process.exit(0);
    }

    const allEvents = parseEventsContent(newContent);
    // Filter to relevant event types
    const relevantEvents = allEvents.filter((e) => RELEVANT_TYPES.has(e.type));
    if (relevantEvents.length === 0) {
      process.stderr.write('[adoption-tracker] No relevant skill events — skipping\n');
      // Still advance cursor past non-relevant events
      writeEventsCursor(cwd, fullContent.length);
      process.exit(0);
    }

    // Group events by skill
    const skillGroups = new Map();
    for (const event of relevantEvents) {
      if (!skillGroups.has(event.skill)) {
        skillGroups.set(event.skill, []);
      }
      skillGroups.get(event.skill).push(event);
    }

    // Reconstruct invocation records
    const sessionId = input.session_id ?? 'unknown';
    const metricsDir = join(cwd, '.harness', 'metrics');
    mkdirSync(metricsDir, { recursive: true });
    const adoptionFile = join(metricsDir, 'adoption.jsonl');

    let written = 0;
    for (const [skill, events] of skillGroups) {
      // Use all events for this skill (including non-relevant) for timing
      const allSkillEvents = allEvents.filter((e) => e.skill === skill);

      const record = {
        skill,
        session: sessionId,
        startedAt: allSkillEvents[0]?.timestamp ?? events[0].timestamp,
        duration: deriveDuration(allSkillEvents.length > 0 ? allSkillEvents : events),
        outcome: deriveOutcome(events),
        phasesReached: derivePhasesReached(events),
      };

      appendFileSync(adoptionFile, JSON.stringify(record) + '\n');
      written++;
    }

    // Advance cursor past processed events
    writeEventsCursor(cwd, fullContent.length);

    process.stderr.write(
      `[adoption-tracker] Wrote ${written} adoption record(s) for session ${sessionId}\n`
    );
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[adoption-tracker] Failed: ${err.message}\n`);
    process.exit(0);
  }
}

main();
