import { minimatch } from 'minimatch';
import type { Layer } from './types';

/**
 * Create a layer definition
 */
export function defineLayer(
  name: string,
  patterns: string[],
  allowedDependencies: string[]
): Layer {
  return {
    name,
    patterns,
    allowedDependencies,
  };
}

/**
 * Resolve a file path to its layer
 */
export function resolveFileToLayer(
  file: string,
  layers: Layer[]
): Layer | undefined {
  for (const layer of layers) {
    for (const pattern of layer.patterns) {
      if (minimatch(file, pattern)) {
        return layer;
      }
    }
  }
  return undefined;
}
