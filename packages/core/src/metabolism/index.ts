/**
 * Basal token metabolism (#1628) — classify token spend into basal (maintenance
 * burn that produces no new artifact/decision/fact) vs anabolic (spend that
 * does), per workflow class, from existing telemetry; emit the basal-share
 * metric and a ranked maintenance-waste list.
 *
 * Reporting only — wiring basal-share into a budget/governor gate is deferred.
 */

export {
  classifySpend,
  SPEND_CLASSES,
  DEFAULT_MAINTENANCE_CLASSES,
  DEFAULT_METABOLISM_CONFIG,
  type SpendClass,
  type SpendOutcome,
  type SpendEvent,
  type MetabolismConfig,
} from './classify';

export {
  buildMetabolismReport,
  type MetabolismReport,
  type WorkflowClassBreakdown,
  type MaintenanceWasteEntry,
} from './report';

export {
  buildSpendLedgerFromTelemetry,
  type BuildSpendLedgerInputs,
  type SpendLedger,
  type AttributedSpendEvent,
  type TokenSource,
} from './adapter';

export {
  evaluateClassifier,
  type LabeledSpendEvent,
  type ClassifierEvaluation,
  type PerClassRates,
} from './evaluate';
