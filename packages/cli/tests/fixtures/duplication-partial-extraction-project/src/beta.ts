import { extractPayload } from './shared/payload.js';

export function keepBeta(rows: string[]): string[] {
  const kept: string[] = [];
  for (const item of rows) {
    const value = extractPayload(item);
    if (value.length > 0) {
      kept.push(value);
    }
  }
  return kept;
}
