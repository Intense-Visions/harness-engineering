import { mkdirSync } from 'fs';
import { resolve } from 'path';

// Pre-create the coverage directory before vitest initializes the V8 coverage
// provider. Without this, the provider's async mkdir(coverage/.tmp) can race
// against worker startup on fast packages (types has 15 tests, ~7ms), causing
// ENOENT when workers try to write coverage data. With the parent directory
// pre-existing, the provider only needs to create .tmp (one level), which
// resolves before any worker can start.
export function setup() {
  mkdirSync(resolve(import.meta.dirname, 'coverage'), { recursive: true });
}
