/**
 * `sdlc.*` envelope validation — pure logic, no I/O.
 *
 * Per-field, diagnostic validation of the v1 CloudEvents profile (pnyon
 * `docs/architecture/waypoint/sdlc-event-schema.md` §1): every rejection
 * names the violated field. The vocabulary is CLOSED — types outside the
 * pinned `SDLC_EVENT_TYPES_V1` list are rejected.
 */

import {
  SDLC_EVENT_TYPES_V1,
  SDLC_SPECVERSION,
  SDLC_VERIFICATION_GRADES,
  type SdlcActor,
  type SdlcEvent,
  type SdlcEventTypeV1,
  type SdlcValidationIssue,
  type SdlcValidationResult,
  type SdlcVerificationGrade,
} from '@harness-engineering/types';
import { isUlid } from './ulid';

const EVENT_TYPES: ReadonlySet<string> = new Set(SDLC_EVENT_TYPES_V1);
const GRADES: ReadonlySet<string> = new Set(SDLC_VERIFICATION_GRADES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** One per-field check: `field`, predicate over the candidate, message. */
type FieldRule = readonly [
  field: string,
  valid: (value: Record<string, unknown>) => boolean,
  message: string,
];

const FIELD_RULES: readonly FieldRule[] = [
  ['specversion', (v) => v['specversion'] === SDLC_SPECVERSION, `must be "${SDLC_SPECVERSION}"`],
  ['id', (v) => isUlid(v['id']), 'must be a 26-char Crockford-base32 ULID'],
  ['source', (v) => isNonEmptyString(v['source']), 'must be a non-empty emitting-scope URI'],
  [
    'type',
    (v) => isNonEmptyString(v['type']) && EVENT_TYPES.has(v['type'] as string),
    'must be a pinned sdlc.*.v1 vocabulary member',
  ],
  [
    'time',
    (v) => isNonEmptyString(v['time']) && !Number.isNaN(Date.parse(v['time'] as string)),
    'must be an RFC 3339 / ISO-8601 timestamp',
  ],
  ['subject', (v) => isNonEmptyString(v['subject']), 'must be a non-empty subject id'],
  [
    'grade',
    (v) => v['grade'] === undefined || (typeof v['grade'] === 'string' && GRADES.has(v['grade'])),
    'must be one of V0, V1, V2, V3',
  ],
  [
    'data',
    (v) => v['data'] === undefined || isRecord(v['data']),
    'must be a JSON object when present',
  ],
];

function validateActor(value: unknown, issues: SdlcValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({
      field: 'actor',
      message: 'required Waypoint extension: { kind, id [, onBehalfOf] }',
    });
    return;
  }
  const kind = value['kind'];
  if (kind !== 'human' && kind !== 'agent') {
    issues.push({ field: 'actor.kind', message: 'must be "human" or "agent"' });
  }
  if (!isNonEmptyString(value['id'])) {
    issues.push({ field: 'actor.id', message: 'must be a non-empty principal id' });
  }
  if (kind === 'agent' && !isNonEmptyString(value['onBehalfOf'])) {
    issues.push({
      field: 'actor.onBehalfOf',
      message: 'agent actors must name the accountable human principal (actor duality)',
    });
  }
}

function validateCauses(value: unknown, issues: SdlcValidationIssue[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ field: 'causes', message: 'must be an array of causing-event ULIDs' });
    return;
  }
  value.forEach((cause, index) => {
    if (!isUlid(cause)) {
      issues.push({
        field: `causes[${index}]`,
        message: 'must be a 26-char Crockford-base32 ULID',
      });
    }
  });
}

/** Assembles the typed event from an already-validated candidate. */
function toEvent(value: Record<string, unknown>): SdlcEvent {
  const withData = value['datacontenttype'] !== undefined || value['data'] !== undefined;
  return {
    specversion: SDLC_SPECVERSION,
    id: value['id'] as string,
    source: value['source'] as string,
    type: value['type'] as SdlcEventTypeV1,
    time: value['time'] as string,
    subject: value['subject'] as string,
    ...(withData ? { datacontenttype: 'application/json' as const } : {}),
    actor: value['actor'] as SdlcActor,
    ...(value['grade'] !== undefined ? { grade: value['grade'] as SdlcVerificationGrade } : {}),
    ...(value['causes'] !== undefined ? { causes: value['causes'] as string[] } : {}),
    ...(value['data'] !== undefined
      ? { data: value['data'] as Readonly<Record<string, unknown>> }
      : {}),
  };
}

/**
 * Validates an unknown value against the v1 envelope profile. Returns the
 * typed event on success, or one named diagnostic per violated field.
 */
export function validateSdlcEvent(value: unknown): SdlcValidationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ field: '$', message: 'event must be a JSON object' }],
    };
  }

  const issues: SdlcValidationIssue[] = [];
  for (const [field, valid, message] of FIELD_RULES) {
    if (!valid(value)) {
      issues.push({ field, message });
    }
  }
  validateActor(value['actor'], issues);
  validateCauses(value['causes'], issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, event: toEvent(value) };
}
