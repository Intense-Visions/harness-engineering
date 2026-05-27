// Vitest global setup. Runs once before any test file is loaded.
//
// Sets HARNESS_CRAFT_LLM=mock by default so tests that exercise craft
// skills get deterministic mock behavior without each having to opt in.
// Tests that need to verify production defaults (in-session) override
// this in their own beforeEach by deleting or reassigning the env var.

if (!process.env.HARNESS_CRAFT_LLM) {
  process.env.HARNESS_CRAFT_LLM = 'mock';
}
