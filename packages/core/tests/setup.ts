/**
 * Vitest setup file
 *
 * Global test configuration and utilities
 */

import { beforeAll } from 'vitest';

// Set default test timeout to 5 seconds
// Prevents tests from hanging indefinitely
beforeAll(() => {
  // Global test configuration can be added here
  // For example: vi.setConfig({ testTimeout: 5000 })
});
