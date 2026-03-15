import { formatName } from './utils';

/**
 * Greet someone by name.
 */
export function greet(name: string): string {
  return `Hello, ${formatName(name)}!`;
}
