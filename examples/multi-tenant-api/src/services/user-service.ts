import { z } from 'zod';
import type { User, CreateUserInput } from '../types/user';

const store: Map<string, User[]> = new Map();
let nextId = 1;

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

/**
 * Create a user scoped to a tenant.
 * @param tenantId - The tenant this user belongs to
 * @param input - User creation input (validated with Zod)
 */
export function createUser(tenantId: string, input: CreateUserInput): User {
  const validated = CreateUserSchema.parse(input);

  if (!tenantId) throw new Error('tenantId is required');

  const user: User = {
    id: String(nextId++),
    tenantId,
    name: validated.name,
    email: validated.email,
  };

  const tenantUsers = store.get(tenantId) ?? [];
  tenantUsers.push(user);
  store.set(tenantId, tenantUsers);

  return user;
}

/**
 * List all users for a tenant.
 * @param tenantId - Only returns users belonging to this tenant
 */
export function listUsers(tenantId: string): User[] {
  if (!tenantId) throw new Error('tenantId is required');
  return [...(store.get(tenantId) ?? [])];
}

/**
 * Get a user by ID, scoped to a tenant.
 * Returns undefined if the user doesn't exist or belongs to a different tenant.
 */
export function getUserById(tenantId: string, userId: string): User | undefined {
  if (!tenantId) throw new Error('tenantId is required');
  const tenantUsers = store.get(tenantId) ?? [];
  return tenantUsers.find(u => u.id === userId);
}

/** Reset store — for testing only */
export function _resetUsers(): void {
  store.clear();
  nextId = 1;
}
