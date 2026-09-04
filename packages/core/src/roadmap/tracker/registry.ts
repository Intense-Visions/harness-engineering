/**
 * Tracker-kind registry — opens the file-less tracker seam beyond its
 * previously hardcoded kinds (see
 * `docs/changes/waypoint-tracker-kind-pnyon/proposal.md`).
 *
 * A registration binds a `roadmap.tracker.kind` string to:
 *  - `loadProjectConfig` — validate the raw `roadmap.tracker` object from
 *    `harness.config.json` into a client config (fail at LOAD time with an
 *    actionable error naming the missing field, not at first API call);
 *  - `create` — build the {@link RoadmapTrackerClient} from that config.
 *
 * Consumers:
 *  - `loadTrackerClientConfigFromProject` keeps its `github` path unchanged
 *    and consults this registry for every other kind;
 *  - `createTrackerClient` keeps its `github-issues`/`linear` branches
 *    unchanged and falls back to this registry before rejecting — so a new
 *    kind plugs in with **no modification to factory source**.
 *
 * Builtin registrations: `pnyon` (Waypoint event-ledger backend).
 * Third-party kinds register via {@link registerTrackerKind}.
 */
import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { RoadmapTrackerClient } from './client';
import { PnyonTrackerAdapter, type PnyonTrackerClientConfig } from './adapters/pnyon';

/**
 * Minimal structural bound for a registered kind's client config. Concrete
 * registrations narrow to their own config interface (e.g.
 * {@link PnyonTrackerClientConfig}); the factory's `TrackerClientConfig`
 * union carries the builtin shapes for type-level consumers.
 */
export interface RegisteredTrackerClientConfig {
  kind: string;
}

export interface TrackerKindRegistration {
  readonly kind: string;
  /**
   * Validate the raw `roadmap.tracker` object (from `harness.config.json`)
   * into this kind's client config. Must fail with an error naming the
   * missing/invalid field.
   */
  loadProjectConfig(
    tracker: Record<string, unknown>,
    projectRoot: string
  ): Result<RegisteredTrackerClientConfig, Error>;
  /** Build the tracker client (resolving env-var credential fallbacks). */
  create(config: RegisteredTrackerClientConfig): Result<RoadmapTrackerClient, Error>;
}

const registrations = new Map<string, TrackerKindRegistration>();

/**
 * Register a tracker kind. Registering an already-registered kind replaces
 * the prior registration (last-write-wins; enables test doubles).
 */
export function registerTrackerKind(registration: TrackerKindRegistration): void {
  registrations.set(registration.kind, registration);
}

export function getTrackerKindRegistration(kind: string): TrackerKindRegistration | undefined {
  return registrations.get(kind);
}

/** Registered kind names, registration order. */
export function listRegisteredTrackerKinds(): string[] {
  return [...registrations.keys()];
}

// ── Builtin: pnyon (Waypoint) ─────────────────────────────────────────────

const pnyonRegistration: TrackerKindRegistration = {
  kind: 'pnyon',

  loadProjectConfig(tracker): Result<PnyonTrackerClientConfig, Error> {
    const url = tracker.url;
    if (typeof url !== 'string' || url.trim() === '') {
      return Err(
        new Error(
          'roadmap.tracker.url is required for kind "pnyon" (the Waypoint ' +
            'per-Outpost API base URL) — set it in harness.config.json'
        )
      );
    }
    const token = tracker.token;
    if (token !== undefined && typeof token !== 'string') {
      return Err(new Error('roadmap.tracker.token must be a string when set (kind "pnyon")'));
    }
    return Ok({
      kind: 'pnyon',
      url,
      ...(typeof token === 'string' && token !== '' ? { token } : {}),
    });
  },

  create(config): Result<RoadmapTrackerClient, Error> {
    const c = config as PnyonTrackerClientConfig;
    const token = c.token ?? process.env.PNYON_TOKEN;
    if (!token) {
      return Err(
        new Error('createTrackerClient: missing Pnyon token (config.token or PNYON_TOKEN env)')
      );
    }
    const opts: ConstructorParameters<typeof PnyonTrackerAdapter>[0] = { url: c.url, token };
    if (c.etagStore !== undefined) opts.etagStore = c.etagStore;
    return Ok(new PnyonTrackerAdapter(opts));
  },
};

registerTrackerKind(pnyonRegistration);
