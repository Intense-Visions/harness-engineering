import type { ArchConfig } from './types';

// --- Handle ---

export interface ArchHandle {
  readonly kind: 'arch-handle';
  readonly scope: string; // 'project' or module path like 'src/services'
  readonly rootDir: string;
  readonly config?: Partial<ArchConfig>;
}

export interface ArchitectureOptions {
  rootDir?: string;
  config?: Partial<ArchConfig>;
}

/**
 * Factory for project-wide architecture handle.
 * Returns a handle (not a promise) that matchers consume.
 */
export function architecture(options?: ArchitectureOptions): ArchHandle {
  return {
    kind: 'arch-handle',
    scope: 'project',
    rootDir: options?.rootDir ?? process.cwd(),
    config: options?.config,
  };
}

/**
 * Factory for module-scoped architecture handle.
 * Named `archModule` to avoid conflict with the `module` reserved word
 * in certain strict-mode contexts.
 */
export function archModule(modulePath: string, options?: ArchitectureOptions): ArchHandle {
  return {
    kind: 'arch-handle',
    scope: modulePath,
    rootDir: options?.rootDir ?? process.cwd(),
    config: options?.config,
  };
}
