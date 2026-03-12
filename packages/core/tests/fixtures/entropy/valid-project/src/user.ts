import type { User } from './types';
import { validateEmail } from './utils';

export function createUser(email: string, name: string): User {
  if (!validateEmail(email)) {
    throw new Error('Invalid email');
  }
  return { id: '1', email, name };
}

export function findUserById(id: string): User | null {
  return null;
}
