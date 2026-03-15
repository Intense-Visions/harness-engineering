import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, listUsers, getUserById, _resetUsers } from '../../src/services/user-service';

describe('Tenant Isolation', () => {
  beforeEach(() => {
    _resetUsers();
  });

  it('tenant-1 cannot see tenant-2 users', () => {
    createUser('tenant-1', { name: 'Alice', email: 'alice@t1.com' });
    createUser('tenant-2', { name: 'Bob', email: 'bob@t2.com' });

    const t1Users = listUsers('tenant-1');
    const t2Users = listUsers('tenant-2');

    expect(t1Users).toHaveLength(1);
    expect(t1Users[0].name).toBe('Alice');
    expect(t2Users).toHaveLength(1);
    expect(t2Users[0].name).toBe('Bob');
  });

  it('getUserById returns undefined for user in different tenant', () => {
    const user = createUser('tenant-1', { name: 'Alice', email: 'alice@t1.com' });

    // Same user ID, different tenant — should not find it
    const result = getUserById('tenant-2', user.id);
    expect(result).toBeUndefined();
  });

  it('empty tenant returns empty list, not all users', () => {
    createUser('tenant-1', { name: 'Alice', email: 'alice@t1.com' });
    const result = listUsers('tenant-3');
    expect(result).toEqual([]);
  });
});
