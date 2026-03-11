/**
 * @harness-engineering/types
 *
 * Core types and interfaces for Harness Engineering toolkit
 */

// Result type for consistent error handling
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Placeholder for future types
export type Placeholder = never;
