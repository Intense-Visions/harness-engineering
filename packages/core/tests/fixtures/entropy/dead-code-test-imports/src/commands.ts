// `runVerify` is imported ONLY by its co-located test (commands.test.ts).
// A test-import-blind dead-export detector wrongly flags it as dead, which is
// how live code (e.g. runVerify imported by verify.test.ts) got deleted.
export function runVerify() {
  return 'verify';
}

// Genuinely dead: no source file and no test imports this. Kept as a control so
// the regression test proves the fix preserves classification of real dead code.
export function deadCommand() {
  return 'dead';
}
