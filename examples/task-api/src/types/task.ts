export type TaskStatus = 'pending' | 'in_progress' | 'complete';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
}
