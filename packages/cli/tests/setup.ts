// Vitest global setup. Runs once before any test file is loaded.
//
// Sets HARNESS_CRAFT_LLM=mock by default so tests that exercise craft
// skills get deterministic mock behavior without each having to opt in.
// Tests that need to verify production defaults (in-session) override
// this in their own beforeEach by deleting or reassigning the env var.

if (!process.env.HARNESS_CRAFT_LLM) {
  process.env.HARNESS_CRAFT_LLM = 'mock';
}

// Disable telemetry export during tests. With `telemetry.enabled: true` in
// harness.config.json, the OTLP exporter otherwise makes background `fetch()`
// calls that race with — and pollute — the `fetch` spies the gateway/delivery
// and MCP tests rely on, causing load-dependent failures. `DO_NOT_TRACK` is the
// standard, code-respected opt-out. Non-clobbering so telemetry-specific tests
// can still override it in their own setup.
if (!process.env.DO_NOT_TRACK) {
  process.env.DO_NOT_TRACK = '1';
}
