import { createHash } from 'node:crypto';

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export function verifyHash(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
