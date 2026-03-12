// VIOLATES pattern: utils should use camelCase naming
export function Helper_Function() {
  return 'helper';
}

export const HELPER_VALUE = 42;

// Missing JSDoc - violates require-jsdoc pattern
export function helper() {
  return 'ok';
}
