/**
 * Self-contained ULID (Universally Unique Lexicographically Sortable Identifier).
 *
 * 48-bit millisecond timestamp + 80-bit randomness, Crockford base32, 26 chars,
 * lexicographically sortable. Monotonic within a millisecond (increments the random
 * component rather than re-randomizing). No runtime dependency — mirrors the
 * native-crypto approach of `shared/uuid.ts`.
 */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)
const ENCODING_LEN = ENCODING.length; // 32
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const ULID_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

let lastTime = -1;
let lastRandom: number[] = [];

function randomChars(len: number): number[] {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % ENCODING_LEN);
}

function incrementRandom(rand: number[]): number[] {
  const out = [...rand];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i]! < ENCODING_LEN - 1) {
      out[i]!++;
      return out;
    }
    out[i] = 0;
  }
  // Overflow (astronomically unlikely) — re-randomize.
  return randomChars(out.length);
}

function encodeTime(time: number, len: number): string {
  let out = '';
  let t = time;
  for (let i = 0; i < len; i++) {
    const mod = t % ENCODING_LEN;
    out = ENCODING[mod]! + out;
    t = (t - mod) / ENCODING_LEN;
  }
  return out;
}

export function generateUlid(seedTime?: number): string {
  const time = seedTime ?? Date.now();
  const random = time === lastTime ? incrementRandom(lastRandom) : randomChars(RANDOM_LEN);
  lastTime = time;
  lastRandom = random;
  return encodeTime(time, TIME_LEN) + random.map((r) => ENCODING[r]!).join('');
}

export function isValidUlid(value: string): boolean {
  return typeof value === 'string' && ULID_RE.test(value);
}

export function ulidTime(value: string): number {
  let time = 0;
  for (const ch of value.slice(0, TIME_LEN)) {
    time = time * ENCODING_LEN + ENCODING.indexOf(ch);
  }
  return time;
}
