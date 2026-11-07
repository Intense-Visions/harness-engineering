import type { Writable } from 'node:stream';

/**
 * Errors a stdin write gets when the child has already closed its end of the
 * pipe: EPIPE (POSIX), ECONNRESET / EOF (win32 named pipes), or a write landing
 * after Node destroyed the stream. None of them carries a result of its own —
 * the child's exit status does.
 */
export function isClosedPipeError(e: NodeJS.ErrnoException): boolean {
  return (
    e.code === 'EPIPE' ||
    e.code === 'ECONNRESET' ||
    e.code === 'EOF' ||
    e.code === 'ERR_STREAM_DESTROYED'
  );
}

/**
 * Attach the `'error'` listener a child's stdin MUST have before it is written.
 *
 * A child that exits without draining stdin makes the pending write fail with
 * EPIPE; with no listener that error is unhandled and crashes the host process
 * (#2298). A closed pipe is ignored because the caller's exit/close handler
 * already decides the outcome. Any other stdin error means the child never got
 * its input, so it is forwarded to `onOtherError` rather than silenced.
 */
export function guardChildStdin(stdin: Writable, onOtherError: (e: Error) => void): void {
  stdin.on('error', (e: NodeJS.ErrnoException) => {
    if (isClosedPipeError(e)) return;
    onOtherError(e);
  });
}
