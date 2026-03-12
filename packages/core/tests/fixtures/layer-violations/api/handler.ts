// VIOLATION: api imports directly from domain (allowed) but also has complex dep
import { createUser } from '../domain/user';

export function handle() {
  return createUser('test');
}
