import type { User } from '../domain/user.js';

export function getUser(id: string): User {
  return { id, name: 'placeholder' };
}
