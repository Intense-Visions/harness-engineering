/**
 * Generate a UUID v4
 * This is a simple implementation that works across Node.js and browser environments
 */
export function generateId(): string {
  // Use crypto.randomUUID if available (Node.js 15.7+)
  if (
    typeof globalThis !== 'undefined' &&
    'crypto' in globalThis &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback: generate a v4 UUID using crypto.getRandomValues
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error(
      'No cryptographic random source available — requires Node.js 15+ or a browser with Web Crypto API'
    );
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 1
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
