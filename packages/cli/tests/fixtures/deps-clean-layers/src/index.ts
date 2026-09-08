// A single self-contained module: one layer, one file, no imports — so the
// analysis genuinely runs and genuinely comes back clean. Used as the
// unchanged-clean-path regression guard for #1996.
export const value = 1;
