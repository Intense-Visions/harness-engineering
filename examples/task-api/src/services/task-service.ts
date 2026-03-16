import type { Task, CreateTaskInput, TaskStatus } from '../types/task';

const tasks: Task[] = [];
let nextId = 1;

export function createTask(input: CreateTaskInput): Task {
  const task: Task = {
    id: String(nextId++),
    title: input.title,
    description: input.description,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
}

export function listTasks(): Task[] {
  return [...tasks];
}

export function getTaskById(id: string): Task | undefined {
  return tasks.find((t) => t.id === id);
}

export function completeTask(id: string): Task | undefined {
  const task = tasks.find((t) => t.id === id);
  if (task) {
    task.status = 'complete';
  }
  return task;
}

/** Reset store — for testing only */
export function _resetTasks(): void {
  tasks.length = 0;
  nextId = 1;
}
