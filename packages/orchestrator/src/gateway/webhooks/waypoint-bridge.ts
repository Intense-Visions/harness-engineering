import type { EventEmitter } from 'node:events';
import { ensureWaypointEmitter } from '@harness-engineering/core';

/**
 * Waypoint → gateway bus bridge (opt-in, pnyon/pnyon#124).
 *
 * The core Waypoint emitter spools `sdlc.*` events repo-locally; this bridge
 * republishes every successfully spooled event onto the orchestrator's
 * EventEmitter bus under the event's own pinned type (e.g.
 * `sdlc.claim.opened.v1`), where the existing `wireWebhookFanout` machinery
 * wraps it in a `GatewayEvent` and delivers it to matching webhook
 * subscriptions with the standard `WebhookQueue` retry semantics.
 *
 * Spool-first ordering is preserved: the emitter appends locally BEFORE
 * notifying listeners, so a slow or failing subscriber can never block or
 * lose the durable copy.
 *
 * When no `waypoint.sink` is configured in `harness.config.json`,
 * `ensureWaypointEmitter` installs nothing and this function is a no-op
 * returning a no-op teardown — the hard non-adopter invariant (PRD Story 1).
 */
function resolveEmitter(projectRoot: string): ReturnType<typeof ensureWaypointEmitter> {
  try {
    return ensureWaypointEmitter(projectRoot);
  } catch {
    return null; // Waypoint init failure never affects the orchestrator.
  }
}

export function wireWaypointSdlcBridge(params: {
  bus: EventEmitter;
  projectRoot: string;
}): () => void {
  const emitter = resolveEmitter(params.projectRoot);
  if (emitter === null) {
    return (): void => {};
  }
  return emitter.onEvent((event) => {
    params.bus.emit(event.type, event);
  });
}
