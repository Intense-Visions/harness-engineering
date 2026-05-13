/**
 * Ports the WHATWG fetch spec blocks at the network layer.
 *
 * https://fetch.spec.whatwg.org/#port-blocking
 *
 * Browsers and Node's undici-based `fetch()` reject any connection to one of
 * these ports with `TypeError: fetch failed` and `cause.message: 'bad port'`.
 * Tools like `curl` do not enforce the list, which makes the failure mode
 * confusing: the port appears reachable from the shell, but every `fetch()`
 * call (including the dashboard proxy and any browser-side request) returns
 * a generic error.
 *
 * Bind a server to one of these ports and any HTTP client the harness ships
 * — and any browser the user opens — will fail.
 */
export const WHATWG_BAD_PORTS: readonly number[] = Object.freeze([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]);

const BAD_PORT_SET: ReadonlySet<number> = new Set(WHATWG_BAD_PORTS);

/** True when `port` is on the WHATWG fetch bad-ports list. */
export function isBadPort(port: number): boolean {
  return BAD_PORT_SET.has(port);
}

/**
 * Throws a clear, actionable Error if `port` is on the WHATWG bad-ports list.
 *
 * Use at server startup to turn a silent-502 footgun into a loud failure.
 * `label` is included in the error message so the user can identify which
 * service refused to start (e.g. `'orchestrator'`, `'dashboard API'`).
 */
export function assertPortUsable(port: number, label = 'server'): void {
  if (isBadPort(port)) {
    throw new Error(
      `Refusing to bind ${label} to port ${port}: this port is on the WHATWG ` +
        `fetch bad-ports list, so browsers and Node's fetch() will reject every ` +
        `connection with "bad port". Choose a different port. See ` +
        `https://fetch.spec.whatwg.org/#port-blocking for the full list.`
    );
  }
}
