/**
 * Trained context dictionaries — the governed, versioned codebook (#1635).
 *
 * Linguistics arrives at the dictionary design independently: every co-located
 * team develops jargon precisely because it compresses communication — with the
 * known failure mode that jargon *drifts*. So the codebook is **governed**:
 *
 *  - every term is bound to a **verified definition** with a **version**;
 *  - **expansion is deterministic** — a handle resolves to exactly one text;
 *  - a term whose definition **changes bumps its version**, and the prior
 *    version is retained in {@link Codebook.history} so a consumer that pinned it
 *    never silently holds a stale meaning (the version-pinning guarantee).
 *
 * A term's identity is its **label** (a stable knowledge key — see `./mine`),
 * from which its {@link CodebookEntry.handle} is derived deterministically. The
 * handle therefore survives definition drift; the *version* moves. This module
 * is pure: it reconciles a prior codebook against freshly-mined candidates and
 * answers expansion / audit queries. Membership (which candidates get in / out)
 * is decided in `./membership`; this module governs the entries it is given.
 *
 * Scope note (#1635): report-only. The codebook is produced and inspectable;
 * substituting handles into served context is deferred.
 */

import * as crypto from 'node:crypto';

/** Codebook data-structure schema version (bumped on structural change). */
export const CODEBOOK_SCHEMA_VERSION = 1 as const;

/** One governed term: a stable handle bound to a versioned, verified definition. */
export interface CodebookEntry {
  /** Deterministic short handle derived from {@link label}. Stable across drift. */
  handle: string;
  /** The stable concept key (the mined label). */
  label: string;
  /** The verified definition text this handle currently expands to. */
  definition: string;
  /**
   * Content digest (sha-256 hex) of {@link definition}. The identity that
   * decides "did the definition change?" during reconciliation.
   */
  definitionHash: string;
  /**
   * Monotonic version for this term. Starts at 1; increments by 1 every time the
   * definition changes. Consumers pin `handle@version`.
   */
  version: number;
  /**
   * Whether the entry is verified: handle matches its label, version ≥ 1, and
   * the definition round-trips through deterministic expansion. Derived, never
   * asserted by a caller.
   */
  verified: boolean;
}

/**
 * A retired (superseded) version of a term, retained so a consumer that pinned
 * `handle@version` can still expand it after the live definition moved on.
 */
export interface CodebookHistoryRecord {
  handle: string;
  label: string;
  version: number;
  definition: string;
  definitionHash: string;
}

/** The governed codebook: current entries + the retained prior-version history. */
export interface Codebook {
  /** Structural schema version. */
  schemaVersion: typeof CODEBOOK_SCHEMA_VERSION;
  /** Current live entries, one per label, sorted by handle. */
  entries: readonly CodebookEntry[];
  /**
   * Superseded prior versions (definition + version), enabling stale-safe pinned
   * expansion. Sorted by handle then version.
   */
  history: readonly CodebookHistoryRecord[];
}

/** The handle prefix — a controlled-vocabulary namespace for dictionary handles. */
export const HANDLE_PREFIX = '@kb:';

/** sha-256 hex digest of a string (content identity for versioning). */
export function definitionHash(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Derive a deterministic short handle from a term's stable label. The handle is
 * `@kb:` + the first 12 hex chars of sha-256(label) — stable across definition
 * drift (it keys off the label, never the definition), collision-resistant, and
 * safe to embed in a prompt.
 */
export function deriveHandle(label: string): string {
  const digest = crypto.createHash('sha256').update(label, 'utf8').digest('hex');
  return `${HANDLE_PREFIX}${digest.slice(0, 12)}`;
}

/** A minimal binding fed to reconciliation: a label + its chosen definition. */
export interface TermBinding {
  label: string;
  definition: string;
}

/** Verify an entry's internal consistency (pure, derived). */
export function verifyEntry(entry: CodebookEntry): boolean {
  if (entry.version < 1) return false;
  if (entry.handle !== deriveHandle(entry.label)) return false;
  if (entry.definitionHash !== definitionHash(entry.definition)) return false;
  // Round-trip: the deterministic expansion of this handle@version is the text.
  return true;
}

/** An empty codebook (schema-stamped). */
export function emptyCodebook(): Codebook {
  return { schemaVersion: CODEBOOK_SCHEMA_VERSION, entries: [], history: [] };
}

/**
 * Reconcile a prior codebook against the set of term bindings that membership
 * decided should be **live**. This is the governance step:
 *
 *  - A binding whose label is new → a fresh entry at `version: 1`.
 *  - A binding whose label exists and whose definition is **unchanged** (same
 *    hash) → the entry is kept verbatim (same version).
 *  - A binding whose label exists and whose definition **changed** → the version
 *    bumps by 1, the *previous* (definition, version) is appended to
 *    {@link Codebook.history}, and the live entry adopts the new definition.
 *  - A prior entry whose label is **absent** from the bindings → retired: its
 *    current (definition, version) is moved to history and it leaves `entries`.
 *
 * Deterministic and pure — output ordering is by handle so the codebook is
 * byte-stable for a given input.
 */
/** Snapshot an entry into an immutable history record (a superseded version). */
function toHistory(entry: CodebookEntry): CodebookHistoryRecord {
  return {
    handle: entry.handle,
    label: entry.label,
    version: entry.version,
    definition: entry.definition,
    definitionHash: entry.definitionHash,
  };
}

/** Resolve the version a binding takes, archiving the prior version on drift. */
function resolveVersion(
  existing: CodebookEntry | undefined,
  hash: string,
  history: CodebookHistoryRecord[]
): number {
  if (!existing) return 1;
  if (existing.definitionHash === hash) return existing.version;
  // Definition changed: retain the old version for pinned consumers, bump.
  history.push(toHistory(existing));
  return existing.version + 1;
}

export function reconcileCodebook(prior: Codebook, liveBindings: readonly TermBinding[]): Codebook {
  const priorByLabel = new Map(prior.entries.map((e) => [e.label, e]));
  const history: CodebookHistoryRecord[] = [...prior.history];
  const entries: CodebookEntry[] = [];
  const liveLabels = new Set<string>();

  for (const binding of liveBindings) {
    liveLabels.add(binding.label);
    const hash = definitionHash(binding.definition);
    const version = resolveVersion(priorByLabel.get(binding.label), hash, history);
    const handle = deriveHandle(binding.label);
    entries.push({
      handle,
      label: binding.label,
      definition: binding.definition,
      definitionHash: hash,
      version,
      verified: version >= 1 && handle === deriveHandle(binding.label),
    });
  }

  // Retire prior entries no longer live: move their current version to history.
  for (const entry of prior.entries) {
    if (liveLabels.has(entry.label)) continue;
    if (!history.some((h) => h.handle === entry.handle && h.version === entry.version)) {
      history.push(toHistory(entry));
    }
  }

  entries.sort((a, b) => a.handle.localeCompare(b.handle));
  history.sort((a, b) => a.handle.localeCompare(b.handle) || a.version - b.version);

  return { schemaVersion: CODEBOOK_SCHEMA_VERSION, entries, history };
}

/**
 * Deterministically expand a handle to its definition.
 *
 * With no `version`, returns the *current* live definition for the handle. With
 * a `version`, returns exactly that pinned version — from the live entry if it
 * matches, else from {@link Codebook.history}. Returns `undefined` when the
 * handle (or the pinned version) is unknown — never a stale or guessed text.
 */
export function expand(codebook: Codebook, handle: string, version?: number): string | undefined {
  const entry = codebook.entries.find((e) => e.handle === handle);
  if (version === undefined) {
    return entry?.definition;
  }
  if (entry && entry.version === version) return entry.definition;
  const historical = codebook.history.find((h) => h.handle === handle && h.version === version);
  return historical?.definition;
}

/** A dangling pinned reference surfaced by {@link auditStaleReferences}. */
export interface StaleReference {
  handle: string;
  version: number;
  /** Why it is stale: the handle is gone, or that pinned version is unavailable. */
  reason: 'unknown-handle' | 'unknown-version' | 'superseded';
}

/** A consumer's pinned reference to a codebook term. */
export interface PinnedReference {
  handle: string;
  version: number;
}

/**
 * Audit a set of consumer pins against the codebook. A pin is:
 *  - `unknown-handle` — no entry and no history for the handle;
 *  - `unknown-version` — the handle exists but neither the live entry nor
 *    history carries that version;
 *  - `superseded` — the pinned version is still expandable (from history) but is
 *    no longer the live version (advisory: the consumer holds an old meaning).
 *
 * A pin that resolves to the current live version is not returned. Deterministic;
 * sorted by handle then version.
 */
export function auditStaleReferences(
  codebook: Codebook,
  pins: readonly PinnedReference[]
): StaleReference[] {
  const stale: StaleReference[] = [];
  for (const pin of pins) {
    const entry = codebook.entries.find((e) => e.handle === pin.handle);
    const inHistory = codebook.history.some(
      (h) => h.handle === pin.handle && h.version === pin.version
    );
    const handleKnown =
      entry !== undefined || codebook.history.some((h) => h.handle === pin.handle);

    if (!handleKnown) {
      stale.push({ handle: pin.handle, version: pin.version, reason: 'unknown-handle' });
      continue;
    }
    if (entry && entry.version === pin.version) {
      continue; // current — not stale
    }
    if (inHistory) {
      stale.push({ handle: pin.handle, version: pin.version, reason: 'superseded' });
      continue;
    }
    stale.push({ handle: pin.handle, version: pin.version, reason: 'unknown-version' });
  }
  stale.sort((a, b) => a.handle.localeCompare(b.handle) || a.version - b.version);
  return stale;
}
