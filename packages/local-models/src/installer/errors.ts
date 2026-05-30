/**
 * `InstallError` — structured error type adapter methods throw when an
 * out-of-band failure occurs (parse failure, advisory-only invocation,
 * unrecoverable transport failure on `list`/`inspect`).
 *
 * In-band failures of `install` and `evict` (target missing, install_failed,
 * not_in_pool) are reported via `InstallResult.status === 'error'` instead,
 * because the manager needs to branch on them as ordinary state changes
 * (queue retry, drift reconcile) rather than crash a refresh tick.
 *
 * `toJSON()` is the contract the orchestrator's structured logger consumes —
 * by serializing the `code` field explicitly we keep the discriminant
 * available downstream even after `JSON.stringify` would otherwise drop it
 * along with the rest of the `Error` prototype's non-enumerable properties.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (S6, S7)
 */

import type { InstallErrorCode } from './types.js';

export interface InstallErrorOptions {
  /** HTTP status when the error originates from a transport response. */
  status?: number;
  /** Model id this error pertains to, when relevant. */
  target?: string;
  /** Wrapped underlying cause (preserved on `.cause` via the standard Error options). */
  cause?: unknown;
}

/**
 * Serialized form preserved across the structured logger boundary. Optional
 * fields are omitted (not emitted as `null`) so the on-disk log line stays
 * compact and grepable.
 */
export interface InstallErrorJson {
  name: 'InstallError';
  code: InstallErrorCode;
  message: string;
  status?: number;
  target?: string;
}

export class InstallError extends Error {
  readonly code: InstallErrorCode;
  readonly status?: number;
  readonly target?: string;

  constructor(code: InstallErrorCode, message: string, options?: InstallErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'InstallError';
    this.code = code;
    if (options?.status !== undefined) this.status = options.status;
    if (options?.target !== undefined) this.target = options.target;
  }

  toJSON(): InstallErrorJson {
    const payload: InstallErrorJson = {
      name: 'InstallError',
      code: this.code,
      message: this.message,
    };
    if (this.status !== undefined) payload.status = this.status;
    if (this.target !== undefined) payload.target = this.target;
    return payload;
  }
}

/**
 * Type guard for catch blocks that need to distinguish an adapter failure
 * from an unrelated error (e.g. an `onEvent` callback throwing).
 */
export function isInstallError(value: unknown): value is InstallError {
  return value instanceof InstallError;
}
