// Vitest global setup. Runs once before any test file is loaded.
//
// Disable telemetry export during tests. With `telemetry.enabled: true` in
// harness.config.json, the OTLP exporter otherwise makes background `fetch()`
// calls to the configured endpoint. Those requests (a) fail with "bad port"
// against the test/default endpoint and (b) race with — and pollute — the
// `fetch` spies that the webhook/gateway/session tests rely on, causing
// wholesale, load-dependent failures. `DO_NOT_TRACK` is the standard,
// code-respected opt-out. Use a non-clobbering default so any test that
// specifically exercises telemetry consent can still override it.
if (!process.env.DO_NOT_TRACK) {
  process.env.DO_NOT_TRACK = '1';
}
