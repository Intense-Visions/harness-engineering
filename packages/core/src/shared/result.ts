/**
 * Re-export Result type and helpers from @harness-engineering/types.
 *
 * This module exists so that internal core code can import from a short
 * relative path (`../shared/result`) without depending on the package name.
 * The canonical definition lives in @harness-engineering/types.
 */
export { Ok, Err, isOk, isErr } from '@harness-engineering/types';
export type { Result } from '@harness-engineering/types';
