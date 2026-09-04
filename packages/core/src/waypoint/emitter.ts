/**
 * Waypoint emitter — the opt-in seam between harness operations and the
 * repo-local `sdlc.*` spool (pnyon/pnyon#124; pnyon ADR-0047).
 *
 * THE HARD INVARIANT (PRD Story 1 — non-adopter invariance): when
 * `harness.config.json` carries no `waypoint.sink`, `initWaypointEmitter`
 * installs nothing and every `emitSdlc*` helper is a guaranteed no-op — no
 * new files, no new I/O, no behavior change for any existing operation.
 * Emission failures while a sink IS configured are recorded on the emitter
 * and never propagate to the calling operation.
 *
 * The emitter is a module-level installable singleton: process entry points
 * that already load `harness.config.json` (CLI, orchestrator) call
 * `initWaypointEmitter(config.waypoint, projectRoot)` once; sanctioned
 * mutators and other emission points call the exported `emitSdlc` helper,
 * which routes through the active emitter or does nothing.
 */

import { userInfo } from 'node:os';
import { basename, join } from 'node:path';
import type {
  SdlcActor,
  SdlcAppendResult,
  SdlcEvent,
  SdlcEventTypeV1,
  SdlcVerificationGrade,
  WaypointConfig,
} from '@harness-engineering/types';
import { SDLC_SPECVERSION } from '@harness-engineering/types';
import { isOk } from '../shared/result';
import { loadWaypointConfig } from './config-loader';
import { FileSpool } from './spool';
import { createUlidFactory } from './ulid';

/** Everything an emission point supplies; the emitter stamps the envelope. */
export interface EmitSdlcOptions {
  /** Pinned vocabulary member, e.g. `sdlc.claim.opened.v1`. */
  readonly type: SdlcEventTypeV1;
  /** Stable subject id, e.g. `item/<feature name>`. */
  readonly subject: string;
  /** Event-type-specific payload. */
  readonly data?: Readonly<Record<string, unknown>>;
  /** Verification grade for grade-asserting events. */
  readonly grade?: SdlcVerificationGrade;
  /** ULIDs of causing events (causal links). */
  readonly causes?: readonly string[];
  /** Explicit actor; defaults to this emitter's agent actor. */
  readonly actor?: SdlcActor;
  /**
   * Emitting harness component, e.g. `roadmap`, `skills`, `fleet`; becomes
   * the default agent actor id `agent://harness/<component>`.
   */
  readonly component?: string;
}

/** One recorded emission failure (observable, never thrown). */
export interface EmissionFailure {
  readonly type: string;
  readonly subject: string;
  readonly issues: readonly { readonly field: string; readonly message: string }[];
}

/** Injectable ports for deterministic tests. */
export interface WaypointEmitterPorts {
  /** ISO timestamp factory. Default: `() => new Date().toISOString()`. */
  readonly nowIso?: () => string;
  /** ULID mint. Default: a per-process monotonic factory. */
  readonly ulid?: () => string;
}

/** Construction options resolved from `WaypointSinkConfig`. */
export interface WaypointEmitterOptions {
  /** Emitting scope URI stamped on every event's `source`. */
  readonly source: string;
  /** Accountable human principal for agent-authored events. */
  readonly onBehalfOf: string;
  /** The spool this emitter appends to. */
  readonly spool: FileSpool;
  readonly ports?: WaypointEmitterPorts;
}

/**
 * Appends one spooled `sdlc.*` event per emission point call. Spool-first:
 * the append lands locally before any (out-of-scope) shipping would be
 * attempted, so harness operations never block on a sink.
 */
export class WaypointEmitter {
  private readonly source: string;
  private readonly onBehalfOf: string;
  private readonly spool: FileSpool;
  private readonly nowIso: () => string;
  private readonly ulid: () => string;
  private readonly listeners = new Set<(event: SdlcEvent) => void>();
  private readonly failures: EmissionFailure[] = [];

  constructor(options: WaypointEmitterOptions) {
    this.source = options.source;
    this.onBehalfOf = options.onBehalfOf;
    this.spool = options.spool;
    this.nowIso = options.ports?.nowIso ?? ((): string => new Date().toISOString());
    this.ulid = options.ports?.ulid ?? createUlidFactory();
  }

  /** Stamps the full v1 envelope for one emission-point call. */
  private buildEnvelope(id: string, options: EmitSdlcOptions): SdlcEvent {
    const actor: SdlcActor = options.actor ?? {
      kind: 'agent',
      id: `agent://harness/${options.component ?? 'core'}`,
      onBehalfOf: this.onBehalfOf,
    };
    return {
      specversion: SDLC_SPECVERSION,
      id,
      source: this.source,
      type: options.type,
      time: this.nowIso(),
      subject: options.subject,
      ...(options.data !== undefined ? { datacontenttype: 'application/json' as const } : {}),
      actor,
      ...(options.grade !== undefined ? { grade: options.grade } : {}),
      ...(options.causes !== undefined && options.causes.length > 0
        ? { causes: options.causes }
        : {}),
      ...(options.data !== undefined ? { data: options.data } : {}),
    };
  }

  /**
   * Appends via the spool's never-throw contract, with a second seatbelt so
   * no emission path can ever fail the caller's operation.
   */
  private safeAppend(candidate: SdlcEvent): SdlcAppendResult {
    try {
      return this.spool.append(candidate);
    } catch (error) {
      return {
        ok: false,
        issues: [
          { field: 'spool', message: error instanceof Error ? error.message : String(error) },
        ],
      };
    }
  }

  /**
   * Builds the envelope, appends it to the spool, and notifies listeners.
   * Never throws; a failed append is recorded and reported in the result.
   * Returns the event ULID on success (for causal chaining), null otherwise.
   */
  emit(options: EmitSdlcOptions): string | null {
    const candidate = this.buildEnvelope(this.ulid(), options);
    const result = this.safeAppend(candidate);
    if (!result.ok) {
      this.failures.push({ type: options.type, subject: options.subject, issues: result.issues });
      return null;
    }
    for (const listener of this.listeners) {
      try {
        listener(candidate);
      } catch {
        // A misbehaving bridge (e.g. gateway bus fan-out) must not fail the
        // originating operation either.
      }
    }
    return candidate.id;
  }

  /**
   * Registers a bridge that observes every successfully spooled event —
   * how the orchestrator fans `sdlc.*` events onto its gateway webhook bus
   * without core depending on the orchestrator. Returns an unsubscribe.
   */
  onEvent(listener: (event: SdlcEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Recorded emission failures (PRD Story 1: observable, never thrown). */
  get emissionFailures(): readonly EmissionFailure[] {
    return this.failures;
  }

  /** The spool this emitter appends to (spool-health observability). */
  get spoolSegment(): FileSpool {
    return this.spool;
  }
}

let activeEmitter: WaypointEmitter | null = null;

/**
 * Installs (or clears, with null) the process-wide emitter. Exposed for
 * entry points and tests; most callers use {@link initWaypointEmitter}.
 */
export function configureWaypointEmitter(emitter: WaypointEmitter | null): void {
  activeEmitter = emitter;
}

/** The active emitter, or null when no Waypoint sink is configured. */
export function getWaypointEmitter(): WaypointEmitter | null {
  return activeEmitter;
}

function defaultOnBehalfOf(): string {
  try {
    return `user://${userInfo().username}`;
  } catch {
    return 'user://unknown';
  }
}

/**
 * Resolves the `waypoint` block of `harness.config.json` into an installed
 * emitter. ABSENT CONFIG = ABSENT FEATURE: without `waypoint.sink` this
 * installs nothing, returns null, touches no file, and creates no directory.
 */
export function initWaypointEmitter(
  config: WaypointConfig | undefined,
  projectRoot: string,
  ports?: WaypointEmitterPorts
): WaypointEmitter | null {
  const sink = config?.sink;
  if (sink === undefined || sink.transport !== 'spool') {
    configureWaypointEmitter(null);
    return null;
  }
  const segmentId = (ports?.ulid ?? createUlidFactory())();
  const spool = new FileSpool({
    spoolDir: join(projectRoot, '.harness', 'spool'),
    segmentId,
    ...(sink.maxEventsPerSegment !== undefined ? { maxEvents: sink.maxEventsPerSegment } : {}),
  });
  const emitter = new WaypointEmitter({
    source: sink.source ?? `harness://repo/${basename(projectRoot)}`,
    onBehalfOf: sink.onBehalfOf ?? defaultOnBehalfOf(),
    spool,
    ...(ports !== undefined ? { ports } : {}),
  });
  configureWaypointEmitter(emitter);
  return emitter;
}

/**
 * The one call every emission point makes: emits through the active emitter,
 * or does nothing at all when none is installed. Never throws. Returns the
 * event ULID when an event was spooled, null otherwise.
 */
export function emitSdlc(options: EmitSdlcOptions): string | null {
  const emitter = activeEmitter;
  if (emitter === null) {
    return null;
  }
  return emitter.emit(options);
}

/** Project roots for which lazy init already ran (memoized per process). */
const ensuredRoots = new Set<string>();

/**
 * Lazy, memoized emitter init for handler-shaped call sites (MCP tools, CLI
 * commands) that know the project root but run without an entry-point hook.
 * Reads the `waypoint` key of `harness.config.json` at most once per root
 * per process; absent or invalid config installs nothing. Never throws
 * (PRD Story 1: a malformed config records nothing and fails nothing).
 */
export function ensureWaypointEmitter(projectRoot: string): WaypointEmitter | null {
  if (activeEmitter !== null) {
    return activeEmitter;
  }
  if (ensuredRoots.has(projectRoot)) {
    return null;
  }
  ensuredRoots.add(projectRoot);
  try {
    const loaded = loadWaypointConfig(projectRoot);
    if (!isOk(loaded)) {
      return null;
    }
    return initWaypointEmitter(loaded.value, projectRoot);
  } catch {
    return null;
  }
}

/** Test-only: clears the installed emitter and the lazy-init memo. */
export function resetWaypointEmitterForTests(): void {
  activeEmitter = null;
  ensuredRoots.clear();
}
