import type { ContainerRuntime } from '@harness-engineering/types';
import { DockerRuntime } from './docker';

export { DockerRuntime } from './docker';

export function createRuntime(kind: 'docker'): ContainerRuntime {
  switch (kind) {
    case 'docker':
      return new DockerRuntime();
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported container runtime: ${String(exhaustive)}`);
    }
  }
}
