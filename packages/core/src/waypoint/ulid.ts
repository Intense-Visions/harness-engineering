/**
 * ULID generation and validation — pure logic, no I/O.
 *
 * ULIDs are the `sdlc.*` event identity and idempotency/dedup key (pnyon
 * `docs/architecture/waypoint/sdlc-event-schema.md` §3): 26 chars of Crockford
 * base32 — a 48-bit millisecond timestamp (10 chars) followed by 80 bits of
 * randomness (16 chars). Lexicographic order equals creation-time order, which
 * is what gives spool-segment merge a coordination-free total order.
 *
 * Time and randomness are injected ports with safe defaults, so the factory
 * is deterministic under test.
 */

/** Crockford base32 alphabet (no I, L, O, U). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const TIME_CHARS = 10;
const RANDOM_CHARS = 16;
/** Canonical ULID length: 10 time chars + 16 random chars. */
export const ULID_LENGTH = TIME_CHARS + RANDOM_CHARS;

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** True when `value` is a well-formed 26-char Crockford-base32 ULID. */
export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && ULID_PATTERN.test(value);
}

/** Ports for deterministic ULID minting. */
export interface UlidFactoryOptions {
  /** Millisecond clock. Default: `Date.now`. */
  readonly now?: () => number;
  /** Fills `bytes` with randomness. Default: `crypto.getRandomValues`. */
  readonly random?: (bytes: Uint8Array) => void;
}

function defaultRandom(bytes: Uint8Array): void {
  globalThis.crypto.getRandomValues(bytes);
}

function encodeTime(timeMs: number): string {
  let remaining = timeMs;
  const chars = new Array<string>(TIME_CHARS);
  for (let i = TIME_CHARS - 1; i >= 0; i -= 1) {
    chars[i] = ALPHABET[remaining % 32] as string;
    remaining = Math.floor(remaining / 32);
  }
  return chars.join('');
}

function encodeRandom(random: (bytes: Uint8Array) => void): string {
  // 80 bits = 16 base32 chars. Draw one byte per char (5 bits used); the
  // entropy budget is preserved by masking each char to 5 independent
  // random bits.
  const bytes = new Uint8Array(RANDOM_CHARS);
  random(bytes);
  let out = '';
  for (const byte of bytes) {
    out += ALPHABET[byte % 32] as string;
  }
  return out;
}

/** Increments a base32 string by one; returns null on overflow. */
function incrementBase32(value: string): string | null {
  const chars = value.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const index = ALPHABET.indexOf(chars[i] as string);
    if (index < ALPHABET.length - 1) {
      chars[i] = ALPHABET[index + 1] as string;
      return chars.join('');
    }
    chars[i] = ALPHABET[0] as string; // carry
  }
  return null;
}

/**
 * A per-process monotonic ULID mint: ids from one factory strictly increase
 * even when the clock does not advance between calls (same-ms calls increment
 * the random suffix — the standard ULID monotonicity rule), so a process's
 * spool segment is always append-ordered.
 */
export function createUlidFactory(options: UlidFactoryOptions = {}): () => string {
  const now = options.now ?? Date.now;
  const random = options.random ?? defaultRandom;
  let lastTime = -1;
  let lastRandom = '';

  return () => {
    const time = now();
    if (time === lastTime) {
      const bumped = incrementBase32(lastRandom);
      // Overflow of 80 random bits within one millisecond is not a realistic
      // event-rate; fall back to fresh randomness rather than throwing.
      lastRandom = bumped ?? encodeRandom(random);
    } else {
      lastTime = time;
      lastRandom = encodeRandom(random);
    }
    return encodeTime(time) + lastRandom;
  };
}
