/**
 * `put_comprehension` — the agent-neutral semantic WRITE-BACK seam (ADR 0109,
 * slice 2). The counterpart to `get_comprehension`: where the latter SERVES the
 * compiled unit (recompiling the static half on a miss), this one lets the agent
 * that is already working a module ATTACH the semantic half it authored — a
 * `{ summary, invariants }` — onto the module's already-compiled, source-fresh
 * static unit, then re-serves the enriched unit.
 *
 * Why a write-back tool instead of resolving a provider (cf. ADR 0106): the model
 * is ALREADY running the session, on whatever subscription/auth that agent (Claude
 * Code, Cursor, Codex, Gemini CLI) already has — so generating semantic costs no
 * API token and spawns no nested process. This tool is provider-neutral by
 * construction: it never resolves a provider and never names a model. Authority
 * stays in TS — the agent-supplied text is validated against `semanticResponseSchema`
 * (the SAME schema the provider path re-validates against), so a malformed payload
 * is rejected here, never written as a malformed unit.
 *
 * Guardrails:
 *  - The static unit MUST already exist and be SOURCE-FRESH. Attaching semantic to
 *    a missing or source-stale unit would bind a summary to source the agent did
 *    not actually see; both are refused with actionable guidance (run/redo
 *    `get_comprehension` first). This keeps the serve-time hash gate (ADR 0108) the
 *    sole correctness authority — semantic can only ride a unit that gate accepts.
 *  - Never throws: every failure is a structured `isError` envelope, mirroring
 *    `get_comprehension` / `get_impact`.
 */

import {
  ComprehensionStore,
  COMPREHENSION_ROOT,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
  serveGate,
  renderServedUnit,
  type ComprehensionUnit,
  type ComprehensionSourceFile,
  type Result,
} from '@harness-engineering/core';
import { semanticResponseSchema } from '../../comprehension/generate-semantic';
import { committedSemanticAllowed } from '../../comprehension/policy';
import { sanitizePath } from '../utils/sanitize-path.js';

export const putComprehensionDefinition = {
  name: 'put_comprehension',
  description:
    "Attach agent-authored semantic understanding (a concise summary + load-bearing invariants) onto a module's already-compiled, source-fresh comprehension unit, then re-serve the enriched unit. Use this after get_comprehension reports `semanticNeeded: true` for a module you understand — it enriches the substrate on your own session's auth (no API token, no provider). Refuses when the unit is missing or source-stale (recompile via get_comprehension first).",
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      module: {
        type: 'string',
        description: 'Module directory (repo-relative, e.g. "packages/core/src/pricing")',
      },
      summary: {
        type: 'string',
        description: "Concise prose summary of the module's purpose and behavior",
      },
      invariants: {
        type: 'array',
        items: { type: 'string' },
        description: 'Load-bearing invariants a maintainer must not break (may be empty)',
      },
      model: {
        type: 'string',
        description:
          'Optional provenance label for who authored the semantic (e.g. the agent/model id); recorded as-is, never resolved',
      },
    },
    required: ['path', 'module', 'summary', 'invariants'],
  },
};

/** A unit store the tool reads/writes (subset of `ComprehensionStore`). */
export interface PutComprehensionStore {
  read(module: string): Promise<Result<ComprehensionUnit>>;
  write(unit: ComprehensionUnit): Promise<Result<void>>;
}

/** A module source reader (subset of the canonical node reader). */
export interface PutComprehensionReader {
  readModuleSource(module: string): Promise<ComprehensionSourceFile[] | null>;
}

/** IO-injected dependencies so the attach logic is disk-free in tests. */
export interface AttachSemanticDeps {
  store: PutComprehensionStore;
  reader: PutComprehensionReader;
  /**
   * ADR 0110 §1 — single-writer policy gate: may THIS session write committed
   * semantic? Only the `main` main-pass may; on the PR path the write is DEFERRED.
   * Injected so the attach logic stays git-free in tests; UNDEFINED means "no
   * policy" (allow) so existing callers/tests are unaffected. Production wires the
   * real branch-based predicate via `resolveDefaultDeps`.
   */
  committedSemanticAllowed?: () => boolean;
}

/** The semantic payload an agent supplies. */
export interface SemanticPayload {
  summary: string;
  invariants: string[];
  model?: string;
}

/** Caps on the write-back size (the compiler path bounds output tokens; enforce a
 * comparable ceiling here so a write-back cannot bloat the served substrate). */
export const MAX_SUMMARY_CHARS = 4000;
export const MAX_INVARIANTS = 40;
export const MAX_INVARIANT_CHARS = 600;

/** A top-level owned section heading in agent prose would corrupt the static half
 * on round-trip (the serializer's `splitSections` treats these as boundaries). */
const OWNED_HEADING = /^\s*##\s+(Summary|Invariants|Interface Contract|Dependency Slice)\s*$/m;

/**
 * Outcome of an attach request. Never a throw. `invalid` (malformed payload) and
 * `error` (infrastructure, e.g. a failed write) are CLIENT/SYSTEM errors surfaced
 * as `isError` envelopes; `unavailable` (no unit) and `stale` are policy refusals
 * surfaced as normal `{ written: false }` results — so an agent can branch on
 * "retry after fixing input / infra" vs "recompile first".
 */
export type PutComprehensionOutcome =
  | { status: 'written'; module: string; rendered: string }
  | { status: 'invalid'; module: string; reason: string }
  | { status: 'error'; module: string; reason: string }
  | { status: 'unavailable'; module: string; reason: string }
  | { status: 'stale'; module: string; reason: string }
  // ADR 0110 §1 — the PR path is static-only: committed semantic is written only
  // on the `main` main-pass (single writer). Off it, the write is DEFERRED — a
  // policy refusal (like `stale`/`unavailable`), never an error.
  | { status: 'deferred'; module: string; reason: string };

/**
 * Attach agent-authored semantic onto a module's source-fresh static unit. Pure
 * over the injected IO — no throw, no disk, no provider, no LLM.
 */
export async function attachSemantic(
  module: string,
  payload: SemanticPayload,
  deps: AttachSemanticDeps
): Promise<PutComprehensionOutcome> {
  // ADR 0110 §1 — single writer: committed semantic is written only on the `main`
  // main-pass. Off it (the PR path / an in-session feature-branch agent), DEFER —
  // the branch stays static-only so a non-deterministic semantic write can never
  // conflict on the merge button. A policy refusal (like `stale`), not an error.
  if (deps.committedSemanticAllowed && !deps.committedSemanticAllowed()) {
    return {
      status: 'deferred',
      module,
      reason:
        'single-writer policy (ADR 0110): committed semantic is written only on the `main` ' +
        'main-pass, not on a branch. The static unit already serves; semantic will be ' +
        'regenerated by the maintainer-local `harness comprehend --all` pass on `main`.',
    };
  }

  // Authority-in-TS: validate the agent-supplied shape before it can touch disk.
  const parsed = semanticResponseSchema.safeParse({
    summary: payload.summary,
    invariants: payload.invariants,
  });
  if (!parsed.success) {
    return {
      status: 'invalid',
      module,
      reason: 'summary must be a string and invariants a string[]',
    };
  }
  if (parsed.data.summary.trim().length === 0) {
    return { status: 'invalid', module, reason: 'summary must be non-empty' };
  }
  if (
    OWNED_HEADING.test(parsed.data.summary) ||
    parsed.data.invariants.some((i) => OWNED_HEADING.test(i))
  ) {
    return {
      status: 'invalid',
      module,
      reason:
        'summary/invariants must not contain a top-level owned section heading ' +
        '(## Summary / ## Invariants / ## Interface Contract / ## Dependency Slice)',
    };
  }
  if (parsed.data.summary.length > MAX_SUMMARY_CHARS) {
    return { status: 'invalid', module, reason: `summary exceeds ${MAX_SUMMARY_CHARS} chars` };
  }
  if (
    parsed.data.invariants.length > MAX_INVARIANTS ||
    parsed.data.invariants.some((i) => i.length > MAX_INVARIANT_CHARS)
  ) {
    return {
      status: 'invalid',
      module,
      reason: `too many invariants (max ${MAX_INVARIANTS}) or an invariant exceeds ${MAX_INVARIANT_CHARS} chars`,
    };
  }

  const existing = await deps.store.read(module);
  if (!existing.ok) {
    return {
      status: 'unavailable',
      module,
      reason:
        'no compiled unit for module — run get_comprehension first to compile the static unit',
    };
  }

  // The static unit must be SOURCE-FRESH: semantic may only ride a unit the serve
  // gate (ADR 0108) accepts, so a summary can never bind to source the agent did
  // not see. A stale unit must be recompiled (get_comprehension) before enrichment.
  const verdict = await serveGate(existing.value, deps.reader);
  if (!verdict.serve) {
    return {
      status: 'stale',
      module,
      reason: 'unit is source-stale — recompile via get_comprehension before attaching semantic',
    };
  }

  const prev = verdict.unit;
  const updated: ComprehensionUnit = {
    ...prev,
    provenance: {
      ...prev.provenance,
      semantic: 'present',
      model: payload.model ?? null,
    },
    summary: parsed.data.summary,
    invariants: parsed.data.invariants,
  };

  // TOCTOU note: source could change between the serve-gate check above and this
  // write. The written unit would then carry a pre-change `sourceHash` and the NEXT
  // serve gate would refuse it (source-stale) forcing a recompile — self-healing,
  // not a correctness hole, so no lock is needed here.
  const written = await deps.store.write(updated);
  if (!written.ok) {
    // Infrastructure failure (distinct from a policy refusal) ⇒ surfaced as isError.
    return { status: 'error', module, reason: `write failed: ${written.error.message}` };
  }
  return { status: 'written', module, rendered: renderServedUnit(updated) };
}

/** Resolve the default disk-backed deps for a project root. */
function resolveDefaultDeps(projectRoot: string): AttachSemanticDeps {
  return {
    store: new ComprehensionStore({
      root: `${projectRoot.replaceAll('\\', '/')}/${COMPREHENSION_ROOT}`,
      io: createNodeComprehensionIO(),
    }),
    reader: createNodeModuleSourceReader(projectRoot),
    // ADR 0110 §1 — enforce single-writer in production: on a branch this refuses
    // with a `deferred` policy result (never writes committed semantic).
    committedSemanticAllowed: () => committedSemanticAllowed(),
  };
}

function textEnvelope(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) };
}

/**
 * MCP handler. Attaches the agent-authored semantic and returns a JSON text
 * envelope. `deps` is injectable for tests; production resolves disk-backed deps.
 * Never throws — every error is an `isError` envelope like `get_comprehension`.
 */
export async function handlePutComprehension(
  input: { path: string; module: string; summary: string; invariants: string[]; model?: string },
  deps?: AttachSemanticDeps
) {
  try {
    if (!input.module || typeof input.module !== 'string') {
      return textEnvelope('Error: "module" is required', true);
    }
    if (typeof input.summary !== 'string' || !Array.isArray(input.invariants)) {
      return textEnvelope(
        'Error: "summary" (string) and "invariants" (string[]) are required',
        true
      );
    }
    const projectRoot = sanitizePath(input.path);
    const resolvedDeps = deps ?? resolveDefaultDeps(projectRoot);
    const outcome = await attachSemantic(
      input.module,
      {
        summary: input.summary,
        invariants: input.invariants,
        ...(input.model ? { model: input.model } : {}),
      },
      resolvedDeps
    );

    if (outcome.status === 'written') {
      return textEnvelope(
        JSON.stringify({
          module: outcome.module,
          written: true,
          semantic: 'present',
          unit: outcome.rendered,
        })
      );
    }
    // Malformed payload or infrastructure failure ⇒ isError (consistent shape for
    // every shape/system error, regardless of where in the pipeline it was caught).
    if (outcome.status === 'invalid' || outcome.status === 'error') {
      return textEnvelope(
        JSON.stringify({ module: outcome.module, written: false, reason: outcome.reason }),
        true
      );
    }
    // Policy refusal (no unit / source-stale / single-writer deferral) ⇒ a normal
    // result the agent handles (recompile first, or accept semantic lands on
    // `main`), not an error. `deferred` is flagged so a caller can distinguish the
    // ADR-0110 single-writer deferral from a stale/missing unit.
    return textEnvelope(
      JSON.stringify({
        module: outcome.module,
        written: false,
        ...(outcome.status === 'deferred' ? { deferred: true } : {}),
        reason: outcome.reason,
      })
    );
  } catch (error) {
    return textEnvelope(`Error: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
