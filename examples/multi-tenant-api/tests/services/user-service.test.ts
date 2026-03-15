import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, listUsers, getUserById, _resetUsers } from '../../src/services/user-service';

describe('UserService', () => {
  beforeEach(() => {
    _resetUsers();
  });

  it('creates a user scoped to a tenant', () => {
    const user = createUser('tenant-1', { name: 'Alice', email: 'alice@example.com' });
    expect(user.tenantId).toBe('tenant-1');
    expect(user.name).toBe('Alice');
  });

  it('lists users for a specific tenant only', () => {
    createUser('tenant-1', { name: 'Alice', email: 'alice@example.com' });
    createUser('tenant-2', { name: 'Bob', email: 'bob@example.com' });

    expect(listUsers('tenant-1')).toHaveLength(1);
    expect(listUsers('tenant-2')).toHaveLength(1);
    expect(listUsers('tenant-1')[0].name).toBe('Alice');
  });

  it('rejects invalid email with Zod validation', () => {
    expect(() => createUser('tenant-1', { name: 'Alice', email: 'not-an-email' }))
      .toThrow();
  });

  it('throws if tenantId is empty', () => {
    expect(() => createUser('', { name: 'Alice', email: 'alice@example.com' }))
      .toThrow('tenantId is required');
  });
});
