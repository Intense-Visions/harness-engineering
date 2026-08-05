// packages/types/src/maintenance-findings.ts
//
// The standard machine-parseable findings contract for maintenance checks (#691).
//
// `harness maintenance run` (and the cron orchestrator) historically recovered
// each task's findings COUNT by regex-scanning free-text check output
// (`N findings|issues|violations|errors`, plus a keyword fallback in
// `classifyCheckExecutionFailure`). That is fragile: checks like `check-docs`
// (doc-drift) and `cleanup` (entropy) emit no clean count, and a wording change
// silently breaks the count.
//
// This module defines ONE shared envelope so a check subcommand can emit its
// finding count as structured data and the runner can consume THAT instead of
// regex. It lives in `@harness-engineering/types` — the one package both the CLI
// (which EMITS the envelope from check subcommands) and the orchestrator (which
// PARSES it in `runHarnessCheck`) already depend on — so the shape cannot drift
// between producer and consumer.
//
// Wire form: a single JSON line printed to stdout, e.g.
//   {"findings":12,"check":"check-docs","v":1}
// Emitting it as one self-contained line (never pretty-printed across lines)
// keeps it recoverable by a last-line-first scan that tolerates surrounding
// human output, mirroring the sibling `parseStatusLine` status contract.

/** Current version of the maintenance findings contract envelope. Bump only on
 * a breaking shape change; parsers tolerate an absent or unknown `v`. */
export const MAINTENANCE_FINDINGS_CONTRACT_VERSION = 1;

/**
 * The standard machine-readable findings envelope a maintenance check subcommand
 * emits (under `--findings-json`) and the maintenance runner consumes in place
 * of regex-recovering a count from prose (#691).
 */
export interface MaintenanceFindingsContract {
  /** Non-negative count of findings the check surfaced (0 = clean). This is the
   * authoritative count — the runner trusts it over any regex recovery. */
  findings: number;
  /** Optional provenance: the check subcommand that produced the envelope
   * (e.g. `'check-docs'`). Advisory only; used for debugging/observability. */
  check?: string;
  /** Contract version ({@link MAINTENANCE_FINDINGS_CONTRACT_VERSION}) for
   * forward-compatibility. */
  v?: number;
}

/**
 * Format a {@link MaintenanceFindingsContract} as the single-line JSON string a
 * check subcommand prints to stdout. `findings` is coerced to a non-negative
 * integer so a producer can pass a raw `.length` without worrying about sign or
 * fractional inputs.
 */
export function formatFindingsContract(findings: number, check?: string): string {
  const envelope: MaintenanceFindingsContract = {
    findings: normalizeFindings(findings),
    v: MAINTENANCE_FINDINGS_CONTRACT_VERSION,
  };
  if (check) envelope.check = check;
  return JSON.stringify(envelope);
}

/**
 * Parse the findings contract from a check's captured stdout. Scans lines from
 * the LAST backward for a single-line JSON object carrying a numeric `findings`
 * field, so a trailing envelope is found ahead of any earlier human output (and
 * a multi-line pretty-printed `--json` blob — whose lines are fragments, never a
 * complete `{...}` object — is correctly ignored). Returns `null` when no
 * envelope is present, which is the signal for the runner to fall back to the
 * legacy regex recovery.
 */
export function parseFindingsContract(output: string): MaintenanceFindingsContract | null {
  if (!output) return null;
  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  // Scan from the LAST line backward so a trailing envelope wins over earlier
  // output; the first line that parses into a valid envelope is authoritative.
  for (let i = lines.length - 1; i >= 0; i--) {
    const contract = parseContractLine(lines[i]!);
    if (contract) return contract;
  }
  return null;
}

/**
 * Parse a single candidate line into a {@link MaintenanceFindingsContract}, or
 * `null` when it is not a JSON object carrying a numeric `findings` field (the
 * caller then keeps scanning earlier lines). The numeric requirement is what
 * distinguishes the envelope from an unrelated JSON line — e.g. check-security's
 * `--json` blob whose `findings` is an ARRAY is rejected, not misread.
 */
function parseContractLine(line: string): MaintenanceFindingsContract | null {
  if (!line.startsWith('{') || !line.endsWith('}')) return null;
  let rec: Record<string, unknown>;
  try {
    // Safe cast: a string that starts with `{`, ends with `}`, and parses is
    // always a JSON object (arrays start with `[`, primitives never match).
    rec = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof rec.findings !== 'number' || !Number.isFinite(rec.findings)) return null;
  const contract: MaintenanceFindingsContract = { findings: normalizeFindings(rec.findings) };
  if (typeof rec.check === 'string') contract.check = rec.check;
  if (typeof rec.v === 'number') contract.v = rec.v;
  return contract;
}

/** Coerce an arbitrary numeric finding count into a non-negative integer. */
function normalizeFindings(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}
