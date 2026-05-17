import type {
  GatewayEvent,
  NotificationEnvelope,
  NotificationSeverity,
} from '@harness-engineering/types';

/**
 * Per-event-type envelope deriver. Returns a partial envelope; missing
 * fields are backfilled by `wrapAsEnvelope` defaults.
 */
type EnvelopeDeriver = (event: GatewayEvent) => Partial<NotificationEnvelope>;

interface MaintenanceData {
  taskId?: string;
  error?: string;
  status?: string;
}

interface InteractionData {
  id?: string;
  question?: string;
  resolution?: string;
}

interface NotificationTestData {
  message?: string;
}

function asObj(data: unknown): Record<string, unknown> {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}

const ENVELOPE_DERIVERS: Record<string, EnvelopeDeriver> = {
  'maintenance.started': (event) => {
    const data = asObj(event.data) as MaintenanceData;
    return {
      title: `Maintenance started: ${data.taskId ?? '(unknown task)'}`,
      summary: `Task \`${data.taskId ?? '(unknown)'}\` is running.`,
      severity: 'info',
    };
  },
  'maintenance.completed': (event) => {
    const data = asObj(event.data) as MaintenanceData;
    return {
      title: `Maintenance done: ${data.taskId ?? '(unknown task)'}`,
      summary: `Task \`${data.taskId ?? '(unknown)'}\` completed successfully.`,
      severity: 'success',
    };
  },
  'maintenance.error': (event) => {
    const data = asObj(event.data) as MaintenanceData;
    return {
      title: `Maintenance failed: ${data.taskId ?? '(unknown task)'}`,
      summary: data.error ?? 'No error message provided.',
      severity: 'error',
    };
  },
  'interaction.created': (event) => {
    const data = asObj(event.data) as InteractionData;
    return {
      title: `Action required: ${truncate(data.question ?? 'pending interaction', 80)}`,
      summary: data.question ?? '(no question text)',
      severity: 'warning',
    };
  },
  'interaction.resolved': (event) => {
    const data = asObj(event.data) as InteractionData;
    return {
      title: `Interaction resolved`,
      summary: data.resolution ?? '(no resolution text)',
      severity: 'info',
    };
  },
  'notification.test': (event) => {
    const data = asObj(event.data) as NotificationTestData;
    return {
      title: 'Test notification from harness',
      summary: data.message ?? 'If you see this, your notification sink is working.',
      severity: 'info',
    };
  },
};

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function fallbackTitle(event: GatewayEvent): string {
  return event.type;
}

function fallbackSummary(event: GatewayEvent): string {
  try {
    return '```\n' + JSON.stringify(event.data, null, 2) + '\n```';
  } catch {
    return String(event.data);
  }
}

function severityFromType(type: string): NotificationSeverity {
  if (type.endsWith('.error') || type.endsWith('.failed')) return 'error';
  if (type.endsWith('.completed') || type.endsWith('.resolved')) return 'success';
  if (type.endsWith('.created') || type.startsWith('interaction.')) return 'warning';
  return 'info';
}

function backfillEnvelope(
  event: GatewayEvent,
  partial: Partial<NotificationEnvelope>
): NotificationEnvelope {
  return {
    title: truncate(partial.title ?? fallbackTitle(event), 280),
    summary: partial.summary ?? fallbackSummary(event),
    severity: partial.severity ?? severityFromType(event.type),
  };
}

/**
 * Wrap a `GatewayEvent` into a platform-agnostic `NotificationEnvelope`.
 * Used when a sink has `wrap_response: true` in its config. Unknown event
 * types fall back to a generic title/summary so newly-emitted events do
 * not require a code change to be deliverable.
 */
export function wrapAsEnvelope(event: GatewayEvent): NotificationEnvelope {
  const deriver = ENVELOPE_DERIVERS[event.type];
  const partial = deriver ? deriver(event) : {};
  const envelope = backfillEnvelope(event, partial);
  if (partial.actions) envelope.actions = partial.actions;
  if (partial.permalink) envelope.permalink = partial.permalink;
  if (event.correlationId) envelope.correlationId = event.correlationId;
  return envelope;
}
