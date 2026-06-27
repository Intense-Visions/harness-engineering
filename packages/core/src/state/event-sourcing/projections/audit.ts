// packages/core/src/state/event-sourcing/projections/audit.ts
//
// Phase 5: pure fold of audit events (user_input_captured + approval_requested +
// approval_resolved) into the append-only session audit trail (subsumes #580).
// Mirrors lanes.ts: defensively copies + sorts by (seq, writerId), no IO, order-independent.
import type { Event } from '../events';

export type AuditKind = 'user_input_captured' | 'approval_requested' | 'approval_resolved';

export interface AuditEntry {
  seq: number;
  timestamp: string;
  kind: AuditKind;
  interactionId?: string;
  /** Verbatim text: the captured user input, the approval prompt, or the response. */
  text: string;
}
export interface AuditProjection {
  entries: AuditEntry[];
}

/** Deterministic total order: (seq asc, writerId asc) — identical to loadEvents. */
function bySeqThenWriter(a: Event, b: Event): number {
  return a.seq - b.seq || (a.writerId < b.writerId ? -1 : a.writerId > b.writerId ? 1 : 0);
}

export function projectAudit(events: Event[]): AuditProjection {
  const sorted = [...events].sort(bySeqThenWriter);
  const entries: AuditEntry[] = [];
  for (const event of sorted) {
    if (event.type === 'user_input_captured') {
      const e: AuditEntry = {
        seq: event.seq,
        timestamp: event.timestamp,
        kind: 'user_input_captured',
        text: event.payload.text,
      };
      if (event.payload.interactionId !== undefined) e.interactionId = event.payload.interactionId;
      entries.push(e);
    } else if (event.type === 'approval_requested') {
      entries.push({
        seq: event.seq,
        timestamp: event.timestamp,
        kind: 'approval_requested',
        interactionId: event.payload.interactionId,
        text: event.payload.prompt,
      });
    } else if (event.type === 'approval_resolved') {
      entries.push({
        seq: event.seq,
        timestamp: event.timestamp,
        kind: 'approval_resolved',
        interactionId: event.payload.interactionId,
        text: event.payload.response,
      });
    }
  }
  return { entries };
}

const KIND_LABEL: Record<AuditKind, string> = {
  user_input_captured: 'input',
  approval_requested: 'approval?',
  approval_resolved: 'approval=',
};

function hhmm(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '??:??';
  }
}

/** Compact timeline for gather_context, derived from the audit projection (replaces formatEventTimeline). */
export function formatAuditTimeline(audit: AuditProjection, limit = 20): string {
  if (audit.entries.length === 0) return '';
  return audit.entries
    .slice(-limit)
    .map((e) => {
      const text = e.text.length > 80 ? `${e.text.slice(0, 77)}...` : e.text;
      return `- ${hhmm(e.timestamp)} [${KIND_LABEL[e.kind]}] ${text}`;
    })
    .join('\n');
}
