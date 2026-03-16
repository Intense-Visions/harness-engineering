// Named exports
export const VERSION = '1.0.0';
export function helper() {
  return true;
}
export class Service {}

// Default export
export default function main() {
  return 'main';
}

// Re-exports
export { join, resolve } from 'path';
export * from 'fs';
export * as utils from './utils';

// Export list
const a = 1;
const b = 2;
export { a, b };
