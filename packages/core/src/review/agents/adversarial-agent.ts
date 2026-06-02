import type {
  ContextBundle,
  ReviewFinding,
  ReviewAgentDescriptor,
  ReviewConfidence,
} from '../types';
import { makeFindingId } from '../constants';

/**
 * Adversarial review agent — looks for failure modes between the existing
 * 4 agents: assumption violations, composition failures, abuse cases,
 * and (at Deep depth) cascade chains.
 *
 * Findings are emitted under `domain: 'bug'` (so the existing schema and
 * dedup logic continue to apply) and `subagent: 'adversarial'` so consumers
 * can distinguish them from the bug-detection agent.
 */
export const ADVERSARIAL_DESCRIPTOR: ReviewAgentDescriptor = {
  domain: 'bug',
  tier: 'strong',
  displayName: 'Adversarial',
  focusAreas: [
    'Assumption violation — hidden invariants the diff assumes but does not enforce',
    'Composition failures — two correct pieces that misbehave together',
    'Abuse cases — adversarial input shapes the diff does not anticipate',
    'Cascade chains (Deep only) — a single failure propagating through downstream callers',
  ],
};

const UNVERIFIED_INPUT_PATTERN =
  /\bJSON\.parse\s*\(\s*(?:req\.|request\.|body\.|input\.|params\.|query\.)/;
const PROMISE_NO_REJECT_PATTERN = /\bnew\s+Promise\s*\(\s*\(?\s*(?:resolve|res)\b\s*(?:\)|,\s*\))/;
const UNGUARDED_OPTIONAL_CALL = /\b([A-Za-z_$][\w$]*)\?\.\1\s*\(/;
const COMPOSE_NO_AWAIT = /^\s*[A-Za-z_$][\w$]*\s*\(.*\)\s*\.\s*then\s*\(/;
const FETCH_NO_TIMEOUT = /\bfetch\s*\(\s*[^,)]+\)/;

interface CandidateMatch {
  file: string;
  line: number;
  snippet: string;
}

function scan(bundle: ContextBundle, predicate: (line: string) => boolean): CandidateMatch[] {
  const matches: CandidateMatch[] = [];
  for (const cf of bundle.changedFiles) {
    const lines = cf.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (predicate(line)) matches.push({ file: cf.path, line: i + 1, snippet: line.trim() });
    }
  }
  return matches;
}

function makeFinding(
  category: string,
  match: CandidateMatch,
  title: string,
  rationale: string,
  suggestion: string,
  confidence: ReviewConfidence
): ReviewFinding {
  return {
    id: makeFindingId('adversarial', match.file, match.line, `${category} ${title}`),
    file: match.file,
    lineRange: [match.line, match.line],
    domain: 'bug',
    severity: confidence >= 75 ? 'important' : 'suggestion',
    title,
    rationale,
    suggestion,
    evidence: [`Line ${match.line}: ${match.snippet}`],
    validatedBy: 'heuristic',
    subagent: 'adversarial',
    confidence,
  };
}

/** Assumption violation — code parses untrusted input without guarding shape. */
function detectAssumptionViolations(bundle: ContextBundle): ReviewFinding[] {
  return scan(bundle, (line) => UNVERIFIED_INPUT_PATTERN.test(line)).map((m) =>
    makeFinding(
      'assumption',
      m,
      'JSON.parse on untrusted input without shape validation',
      'The diff assumes the parsed value matches an expected schema. Malformed JSON throws synchronously; structurally-valid-but-semantically-wrong JSON propagates downstream as a malformed object.',
      'Validate the parsed value against a schema (zod, valibot) or guard each access with a narrow type predicate before use.',
      75
    )
  );
}

/** Composition failure — two patterns that work alone but compose badly. */
function detectCompositionFailures(bundle: ContextBundle): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  findings.push(
    ...scan(bundle, (line) => COMPOSE_NO_AWAIT.test(line) && !line.includes('await ')).map((m) =>
      makeFinding(
        'composition',
        m,
        'Floating Promise chain without await or .catch',
        'A `.then(...)` chain without `await` or `.catch(...)` produces an unhandled rejection if any link rejects. Composing two such chains lets a failure in one silently delay or stall the other.',
        'Await the chain or attach `.catch(handler)` and verify the handler is observable.',
        75
      )
    )
  );
  findings.push(
    ...scan(bundle, (line) => UNGUARDED_OPTIONAL_CALL.test(line)).map((m) =>
      makeFinding(
        'composition',
        m,
        'Optional chain over a callable masks composition failure',
        'Calling `foo?.foo(...)` silently becomes `undefined` when the receiver is nil. When composed with downstream code that expects a value, this propagates as a confusing `undefined` rather than a clear error.',
        'Decide explicitly: either guard up front and throw a meaningful error, or rename the variable so the optionality is visible at the call site.',
        50
      )
    )
  );
  return findings;
}

/** Abuse case — public-facing surface that does not bound external IO. */
function detectAbuseCases(bundle: ContextBundle): ReviewFinding[] {
  return scan(
    bundle,
    (line) => FETCH_NO_TIMEOUT.test(line) && !line.includes('AbortController')
  ).map((m) =>
    makeFinding(
      'abuse',
      m,
      'fetch() without timeout or AbortController',
      'A `fetch` with no timeout allows a slow or malicious upstream to hold a request open indefinitely. Multiple such calls can exhaust the calling pool.',
      'Pass `signal: AbortSignal.timeout(ms)` (Node 18+) or wire an `AbortController` with an explicit timeout.',
      100
    )
  );
}

/** Cascade construction — Deep-tier only — Promise constructor without a reject path. */
function detectCascades(bundle: ContextBundle): ReviewFinding[] {
  return scan(bundle, (line) => PROMISE_NO_REJECT_PATTERN.test(line)).map((m) =>
    makeFinding(
      'cascade',
      m,
      'new Promise constructor without a reject parameter',
      'A Promise that only captures `resolve` cannot signal failure. Errors thrown inside the executor become unhandled, and downstream chains await indefinitely if no `resolve` path is reached.',
      'Add a `reject` parameter and forward thrown errors, or refactor to an `async` function that returns the value or throws.',
      100
    )
  );
}

/**
 * Run the adversarial review agent.
 *
 * Cascade construction (`detectCascades`) is gated on Deep depth — callers that
 * dispatch the agent at Standard depth should set `runCascades = false`.
 */
export function runAdversarialAgent(
  bundle: ContextBundle,
  options: { runCascades?: boolean } = {}
): ReviewFinding[] {
  const { runCascades = true } = options;
  const findings: ReviewFinding[] = [];
  findings.push(...detectAssumptionViolations(bundle));
  findings.push(...detectCompositionFailures(bundle));
  findings.push(...detectAbuseCases(bundle));
  if (runCascades) findings.push(...detectCascades(bundle));
  return findings;
}
