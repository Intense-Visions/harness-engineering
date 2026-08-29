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
}

/** The semantic payload an agent supplies. */
export interface SemanticPayload {
  summary: string;
  invariants: string[];
  model?: string;
}

/** Outcome of an attach request. Never a throw. */
export type PutComprehensionOutcome =
  | { status: 'written'; module: string; rendered: string }
  | { status: 'invalid'; module: string; reason: string }
  | { status: 'unavailable'; module: string; reason: string }
  | { status: 'stale'; module: string; reason: string };

/**
 * Attach agent-authored semantic onto a module's source-fresh static unit. Pure
 * over the injected IO — no throw, no disk, no provider, no LLM.
 */
export async function attachSemantic(
  module: string,
  payload: SemanticPayload,
  deps: AttachSemanticDeps
): Promise<PutComprehensionOutcome> {
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

  const written = await deps.store.write(updated);
  if (!written.ok) {
    return { status: 'unavailable', module, reason: written.error.message };
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
    return textEnvelope(
      JSON.stringify({ module: outcome.module, written: false, reason: outcome.reason })
    );
  } catch (error) {
    return textEnvelope(`Error: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
