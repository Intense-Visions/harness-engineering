// VIOLATION: domain imports from services (not allowed)
import { validateUser } from '../services/validation';

export interface User {
  id: string;
  name: string;
}

export function createUser(name: string): User {
  validateUser(name);
  return { id: '1', name };
}
