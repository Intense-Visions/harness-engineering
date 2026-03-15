import { describe, it, expect, beforeEach } from 'vitest';
import { createTask, listTasks, getTaskById, completeTask, _resetTasks } from '../../src/services/task-service';

describe('TaskService', () => {
  beforeEach(() => {
    _resetTasks();
  });

  it('creates a task with pending status', () => {
    const task = createTask({ title: 'Test', description: 'A test task' });
    expect(task.id).toBeDefined();
    expect(task.title).toBe('Test');
    expect(task.status).toBe('pending');
  });

  it('lists all tasks', () => {
    createTask({ title: 'One', description: '' });
    createTask({ title: 'Two', description: '' });
    expect(listTasks()).toHaveLength(2);
  });

  it('gets a task by ID', () => {
    const created = createTask({ title: 'Find me', description: '' });
    const found = getTaskById(created.id);
    expect(found?.title).toBe('Find me');
  });

  it('returns undefined for unknown ID', () => {
    expect(getTaskById('999')).toBeUndefined();
  });

  it('completes a task', () => {
    const task = createTask({ title: 'Complete me', description: '' });
    const completed = completeTask(task.id);
    expect(completed?.status).toBe('complete');
  });
});
