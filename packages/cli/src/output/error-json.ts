/**
 * JSON serialization for `Error` instances.
 *
 * `JSON.stringify(new Error('boom'))` is `{}`: `message` and `stack` are OWN but
 * NON-enumerable properties, so every `--json` document that embedded an Error
 * (a `Result`'s `error`, a `cause`) lost the one field a consumer needs —
 * `harness linter validate --json` printed
 * `{"error":{"code":"FILE_NOT_FOUND","cause":{…},"name":"ParseError"}}` with no
 * message. The CLI has no single JSON emitter (~130 command files call
 * `JSON.stringify` directly), so the fix lives at the one point they all share:
 * the serializer's `toJSON` protocol on `Error.prototype`, installed once by the
 * `harness` binary before any command runs.
 */

/**
 * Plain-object view of an Error: its own enumerable fields, then `name` and
 * `message`. An Error `cause` chain is serialized eagerly with a cycle guard
 * (`toJSON` returns a fresh object each call, so `JSON.stringify`'s own cycle
 * detection cannot see an `err.cause === err` loop).
 */
export function serializeError(
  error: Error,
  seen: Set<Error> = new Set()
): Record<string, unknown> {
  seen.add(error);
  const out: Record<string, unknown> = { ...error };
  out['name'] = error.name;
  out['message'] = error.message;
  // `cause` passed through the ES2022 constructor option is non-enumerable.
  const cause: unknown = 'cause' in out ? out['cause'] : error.cause;
  if (cause instanceof Error) {
    out['cause'] = seen.has(cause) ? '[Circular]' : serializeError(cause, seen);
  } else if (cause !== undefined) {
    out['cause'] = cause;
  }
  return out;
}

/**
 * Installs {@link serializeError} as `Error.prototype.toJSON` (non-enumerable),
 * unless something already defined one. Idempotent. `stack` is deliberately
 * omitted — it is diagnostic noise in a machine document and leaks paths.
 */
export function installErrorJsonSerialization(): void {
  if (Object.prototype.hasOwnProperty.call(Error.prototype, 'toJSON')) return;
  Object.defineProperty(Error.prototype, 'toJSON', {
    value: function toJSON(this: Error) {
      return serializeError(this);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
