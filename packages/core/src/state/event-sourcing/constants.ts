// packages/core/src/state/event-sourcing/constants.ts
/** Authoritative append-only event log file name (resolved per getStateDir scope). */
export const EVENT_LOG_FILE = 'state.events.jsonl';
/** Directory holding spilled oversized event payloads, as <hash>.json files. */
export const EVENT_BLOBS_DIR = 'state.events.blobs';
/**
 * Conservative cross-platform atomic single-write() bound (one fs block / memory page).
 * A serialized JSONL line (including trailing newline) at/over this size spills its
 * payload to a blob so the on-disk line stays under one atomic append.
 */
export const MAX_LINE_BYTES = 4096;
/** Marker key replacing a spilled payload on the stored line: { "$blob": "<hash>" }. */
export const BLOB_REF_KEY = '$blob';
/** Derived (non-authoritative) materialized snapshot file, written only by materialize(). */
export const SNAPSHOT_FILE = 'state.snapshot.json';
