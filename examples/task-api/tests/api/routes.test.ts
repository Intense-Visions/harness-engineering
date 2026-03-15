import { describe, it, expect, beforeEach } from 'vitest';
import { createTask, listTasks, _resetTasks } from '../../src/services/task-service';

// Test the service layer directly — route integration tests would need supertest
// This validates the business logic that routes depend on
describe('Task API logic', () => {
  beforeEach(() => {
    _resetTasks();
  });

  it('create + list round trip', () => {
    createTask({ title: 'API task', description: 'Created via API' });
    const tasks = listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('API task');
  });

  it('create + complete round trip', () => {
    const task = createTask({ title: 'To complete', description: '' });
    expect(task.status).toBe('pending');

    const { completeTask } = require('../../src/services/task-service');
    const completed = completeTask(task.id);
    expect(completed.status).toBe('complete');
  });

  it('list returns empty array initially', () => {
    expect(listTasks()).toEqual([]);
  });
});
