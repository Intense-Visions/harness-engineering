// A single self-contained module: one layer, one file, no imports — so the
// analysis genuinely runs and genuinely comes back clean when the engine is
// healthy. Paired with a `deps.fallbackBehavior: "warn"` config so the
// abstention-downgrade path of #2098 has a fixture of its own.
export const value = 1;
