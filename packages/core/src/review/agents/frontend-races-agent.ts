import type { ContextBundle, ReviewFinding, ReviewAgentDescriptor } from '../types';
import { makeFindingId } from '../constants';

/**
 * Frontend-races review agent — activated when typescript-strict is active
 * AND an async-UI signal is present in the diff (.tsx, useEffect, setTimeout,
 * setInterval, addEventListener, data-controller=, etc.).
 *
 * Flags lifecycle cleanup gaps, hook-timing mistakes, concurrent-interaction
 * bugs, and promise/timer flows that leave stale work behind.
 *
 * Emits `subagent: 'frontend-races'` and numeric `confidence`.
 */
export const FRONTEND_RACES_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'bug',
  tier: 'standard',
  displayName: 'Frontend-races',
  focusAreas: [
    'Lifecycle cleanup gaps — listeners or timers outliving the owner',
    'Hook timing mistakes — state set in the wrong hook, async after unmount',
    'Concurrent interactions — overlapping clicks/requests, impossible-state booleans',
    'Stale work — promises and timers whose callbacks fire after teardown',
  ],
};

interface FileContext {
  path: string;
  content: string;
  lines: string[];
}

function frontendFiles(bundle: ContextBundle): FileContext[] {
  return bundle.changedFiles
    .filter((cf) => /\.(ts|tsx|jsx|js)$/.test(cf.path))
    .filter((cf) => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(cf.path))
    .filter((cf) => !/__tests__\//.test(cf.path))
    .filter((cf) => !/\.d\.ts$/.test(cf.path))
    .map((cf) => ({ path: cf.path, content: cf.content, lines: cf.content.split('\n') }));
}

/**
 * For each `setInterval(...)` / `setTimeout(...)` call without a sibling
 * `clearInterval` / `clearTimeout` anywhere in the same file, emit a finding.
 *
 * Mechanical heuristic — the same file is the cleanup boundary in practice.
 * False positives drop to 0 when the cleanup lives in the same module.
 */
function detectUnclearedTimers(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const file of frontendFiles(bundle)) {
    const hasClearInterval = /\bclearInterval\s*\(/.test(file.content);
    const hasClearTimeout = /\bclearTimeout\s*\(/.test(file.content);
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i]!;
      if (/\bsetInterval\s*\(/.test(line) && !hasClearInterval) {
        findings.push({
          id: makeFindingId('frontend-races', file.path, i + 1, 'setInterval no clear'),
          file: file.path,
          lineRange: [i + 1, i + 1],
          domain: 'bug',
          severity: 'important',
          title: 'setInterval without matching clearInterval in the same module',
          rationale:
            'An interval that is never cleared keeps firing after the owning component, controller, or scope is gone. Each render creates a new timer; old timers continue mutating state that no longer exists.',
          suggestion:
            'Capture the handle and clear it in the matching teardown path (useEffect return, controller `disconnect`, or explicit `dispose`). For one-shot work, prefer setTimeout with a clearTimeout in the cleanup path.',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
          subagent: 'frontend-races',
          confidence: 100,
        });
      }
      if (
        /\bsetTimeout\s*\(/.test(line) &&
        !hasClearTimeout &&
        // ignore intentional fire-and-forget where the callback is a single bound function with no closure access
        !/setTimeout\s*\(\s*[A-Za-z_$][\w$]*\s*(?:,|\))/.test(line)
      ) {
        findings.push({
          id: makeFindingId('frontend-races', file.path, i + 1, 'setTimeout no clear'),
          file: file.path,
          lineRange: [i + 1, i + 1],
          domain: 'bug',
          severity: 'suggestion',
          title: 'setTimeout with closure access but no clearTimeout in the same module',
          rationale:
            'A timeout that closes over mutable state can fire after the owner is gone, updating stale references and triggering "set state on unmounted component" warnings.',
          suggestion:
            'Capture the timeout id and clear it in the teardown path, or extract a pure function and bind explicit arguments.',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
          subagent: 'frontend-races',
          confidence: 75,
        });
      }
    }
  }
  return findings;
}

/**
 * `addEventListener` without `removeEventListener` in the same module.
 */
function detectDanglingListeners(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const file of frontendFiles(bundle)) {
    const hasRemove = /\bremoveEventListener\s*\(/.test(file.content);
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i]!;
      if (/\baddEventListener\s*\(/.test(line) && !hasRemove) {
        findings.push({
          id: makeFindingId('frontend-races', file.path, i + 1, 'listener no remove'),
          file: file.path,
          lineRange: [i + 1, i + 1],
          domain: 'bug',
          severity: 'important',
          title: 'addEventListener without removeEventListener in the same module',
          rationale:
            'Event listeners that are not removed accumulate across mounts. Each mount adds another callback, and old callbacks fire against stale state.',
          suggestion:
            'Pair every `addEventListener` with a `removeEventListener` in the teardown path. In React, return the cleanup from `useEffect`; in Stimulus, remove in `disconnect()`.',
          evidence: [`Line ${i + 1}: ${line.trim()}`],
          validatedBy: 'heuristic',
          subagent: 'frontend-races',
          confidence: 100,
        });
      }
    }
  }
  return findings;
}

/**
 * `useEffect` callback that calls `setState` in `useState` for a value derived
 * during render — should be derived inline, not via effect.
 */
function detectMisplacedStateUpdate(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const useEffectStateRe = /useEffect\s*\(\s*\(\)\s*=>\s*\{\s*set[A-Z]\w*\s*\(/;
  for (const file of frontendFiles(bundle)) {
    for (let i = 0; i < file.lines.length; i++) {
      const window = file.lines.slice(i, Math.min(i + 3, file.lines.length)).join('\n');
      if (useEffectStateRe.test(window)) {
        findings.push({
          id: makeFindingId('frontend-races', file.path, i + 1, 'state in useEffect'),
          file: file.path,
          lineRange: [i + 1, Math.min(i + 3, file.lines.length)],
          domain: 'bug',
          severity: 'suggestion',
          title: 'useEffect immediately calling setState may indicate derived state',
          rationale:
            'When an effect runs only to set state from props or render-time values, the same value can be derived inline. The effect adds a render, a stale-closure risk, and a window where the state and its source disagree.',
          suggestion:
            'Compute the value inline from props. Reserve `useEffect` for true side effects (subscriptions, IO).',
          evidence: [`Line ${i + 1}: ${file.lines[i]!.trim()}`],
          validatedBy: 'heuristic',
          subagent: 'frontend-races',
          confidence: 50,
        });
      }
    }
  }
  return findings;
}

/**
 * `await fetch(...)` followed by `setState(...)` with no abort signal — a stale-
 * response race when the component unmounts mid-flight.
 */
function detectStaleResponseRace(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const file of frontendFiles(bundle)) {
    for (let i = 0; i < file.lines.length - 4; i++) {
      const window = file.lines.slice(i, i + 5).join('\n');
      if (!/\bawait\s+(?:fetch|axios|api)/.test(window)) continue;
      if (!/\bset[A-Z]\w*\s*\(/.test(window)) continue;
      if (/AbortController|AbortSignal\.timeout|signal:/.test(window)) continue;
      findings.push({
        id: makeFindingId('frontend-races', file.path, i + 1, 'stale response race'),
        file: file.path,
        lineRange: [i + 1, i + 5],
        domain: 'bug',
        severity: 'important',
        title: 'await fetch followed by setState without an abort signal',
        rationale:
          'When the component unmounts (or re-renders with new inputs) before the response resolves, the late-arriving setState writes stale data onto a now-replaced component, causing flashes of wrong content or warnings about unmounted components.',
        suggestion:
          'Pass `signal: AbortSignal.timeout(ms)` or an `AbortController` and abort it in the cleanup path. Alternatively, ignore the response when a request-generation counter has advanced.',
        evidence: [`Lines ${i + 1}-${i + 5}`],
        validatedBy: 'heuristic',
        subagent: 'frontend-races',
        confidence: 75,
      });
      // Skip ahead so we don't double-emit overlapping windows.
      i += 4;
    }
  }
  return findings;
}

/**
 * Run the frontend-races review agent. Caller must verify activation
 * (typescript-strict active + async-UI signal in diff) per the depth calibrator.
 */
export function runFrontendRacesAgent(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  findings.push(...detectUnclearedTimers(bundle));
  findings.push(...detectDanglingListeners(bundle));
  findings.push(...detectMisplacedStateUpdate(bundle));
  findings.push(...detectStaleResponseRace(bundle));
  return findings;
}
