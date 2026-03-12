export function helper() {
  return 'helper';
}

// This is exported but never imported anywhere
export function unusedHelper() {
  return 'unused';
}

// This is imported but never used
export function anotherHelper() {
  return 'another';
}
