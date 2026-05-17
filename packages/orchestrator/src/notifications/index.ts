/**
 * Hermes Phase 3 notifications module — public surface re-export.
 * External consumers (CLI, dashboard, tests) reach in through the
 * orchestrator package root via re-export from src/index.ts.
 */
export { wrapAsEnvelope } from './envelope.js';
export { SlackSink } from './slack-sink.js';
export type { SlackSinkOptions } from './slack-sink.js';
export { SinkRegistry, SinkConfigError } from './registry.js';
export type { RegistryEntry, FromConfigOptions } from './registry.js';
export { wireNotificationSinks } from './events.js';
export type { NotificationSink, NotificationSinkDeliverInput } from './sink.js';
