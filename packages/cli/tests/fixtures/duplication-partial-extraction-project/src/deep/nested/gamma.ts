import { extractPayload } from '../../shared/payload.js';

export function keepGamma(entries: string[]): string[] {
  const acc: string[] = [];
  for (const item of entries) {
    const value = extractPayload(item);
    if (value.length > 0) {
      acc.push(value);
    }
  }
  return acc;
}
