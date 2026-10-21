import { extractPayload } from '../shared/payload.js';

export function keepAlpha(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const value = extractPayload(item);
    if (value.length > 0) {
      out.push(value);
    }
  }
  return out;
}
