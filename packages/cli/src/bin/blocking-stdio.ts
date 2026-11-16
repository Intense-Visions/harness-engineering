/**
 * Make piped stdout/stderr writes synchronous so a command's explicit
 * `process.exit()` cannot discard queued output (#2254).
 *
 * Node writes to a pipe asynchronously on POSIX: a large write lands one pipe
 * buffer (64 KiB on macOS) and queues the rest, and `process.exit()` drops the
 * queue. Blocking pipe handles are what Node already uses for stdio pipes on
 * Windows. Files have no handle and POSIX TTYs are already synchronous, so
 * only pipes are touched.
 */
interface StdioLike {
  _type?: string;
  _handle?: { setBlocking?: (blocking: boolean) => number } | null;
}

/** Best-effort; returns how many streams were switched to blocking mode. */
export function makeStdioPipesBlocking(
  streams: readonly unknown[] = [process.stdout, process.stderr]
): number {
  let switched = 0;
  for (const stream of streams) {
    const s = stream as StdioLike | null | undefined;
    const handle = s?._type === 'pipe' ? s._handle : undefined;
    if (typeof handle?.setBlocking !== 'function') continue;
    try {
      if (handle.setBlocking(true) === 0) switched++;
    } catch {
      // a stdio quirk must never take the CLI down; stay asynchronous
    }
  }
  return switched;
}
