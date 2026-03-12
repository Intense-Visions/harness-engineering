import { createUser } from '../domain/user';
import type { User } from '../domain/user';

export function registerUser(name: string): User {
  return createUser(name);
}
