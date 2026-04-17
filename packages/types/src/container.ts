import type { Result } from './result';

// --- Container Runtime ---

/**
 * Categories of errors from container runtime operations.
 */
export type ContainerErrorCategory =
  | 'runtime_not_found'
  | 'container_create_failed'
  | 'container_exec_failed'
  | 'container_remove_failed';

/**
 * Error returned by a container runtime.
 */
export interface ContainerError {
  /** Machine-readable category */
  category: ContainerErrorCategory;
  /** Human-readable message */
  message: string;
  /** Optional additional context */
  details?: unknown;
}

/**
 * Options for creating a container.
 */
export interface ContainerCreateOpts {
  /** Docker image to use */
  image: string;
  /** Host path to bind-mount as the workspace */
  workspacePath: string;
  /** Whether the root filesystem is read-only */
  readOnly: boolean;
  /** User:group to run as (e.g., '1000:1000') */
  user: string;
  /** Docker network mode */
  network: 'host' | 'none' | 'bridge';
  /** Environment variables to inject */
  env: Record<string, string>;
  /** Additional Docker CLI arguments */
  extraArgs?: string[];
}

/**
 * Options for executing a command in a container.
 */
export interface ContainerExecOpts {
  /** Working directory inside the container */
  cwd?: string;
  /** Additional environment variables for the exec */
  env?: Record<string, string>;
}

/**
 * Handle to a running container.
 */
export interface ContainerHandle {
  /** Container ID (e.g., Docker container ID) */
  containerId: string;
  /** Name of the runtime that created this container */
  runtime: string;
}

/**
 * Interface for container runtime implementations (Docker, Dagger, etc.)
 */
export interface ContainerRuntime {
  /** Unique name of the runtime */
  readonly name: string;
  /** Creates a new container */
  createContainer(opts: ContainerCreateOpts): Promise<Result<ContainerHandle, ContainerError>>;
  /** Executes a command in a container, streaming stdout lines */
  execInContainer(
    handle: ContainerHandle,
    cmd: string[],
    opts?: ContainerExecOpts
  ): AsyncGenerator<string, number, void>;
  /** Removes a container */
  removeContainer(handle: ContainerHandle): Promise<Result<void, ContainerError>>;
  /** Verifies runtime availability */
  healthCheck(): Promise<Result<void, ContainerError>>;
}

// --- Secret Backend ---

/**
 * Categories of errors from secret resolution.
 */
export type SecretErrorCategory = 'provider_unavailable' | 'secret_not_found' | 'access_denied';

/**
 * Error returned by a secret backend.
 */
export interface SecretError {
  /** Machine-readable category */
  category: SecretErrorCategory;
  /** Human-readable message */
  message: string;
  /** The key that failed to resolve, if applicable */
  key?: string;
}

/**
 * Interface for secret resolution backends (env, 1Password, Vault, etc.)
 */
export interface SecretBackend {
  /** Unique name of the backend */
  readonly name: string;
  /** Resolves secret keys to their values */
  resolveSecrets(keys: string[]): Promise<Result<Record<string, string>, SecretError>>;
  /** Verifies backend availability */
  healthCheck(): Promise<Result<void, SecretError>>;
}

// --- Configuration ---

/**
 * Container execution configuration.
 */
export interface ContainerConfig {
  /** Container runtime to use */
  runtime: 'docker';
  /** Docker image to use */
  image: string;
  /** Whether root filesystem is read-only (default: true) */
  readOnly?: boolean;
  /** User:group to run as (default: '1000:1000') */
  user?: string;
  /** Docker network mode (default: 'host') */
  network?: 'host' | 'none' | 'bridge';
  /** Additional Docker CLI arguments */
  extraArgs?: string[];
}

/**
 * Secret injection configuration.
 */
export interface SecretConfig {
  /** Secret backend to use */
  backend: 'env' | 'onepassword' | 'vault';
  /** Secret keys to resolve and inject */
  keys: string[];
  /** Vault server address (for vault backend) */
  vaultAddr?: string;
  /** Vault secret path (for vault backend) */
  vaultPath?: string;
  /** 1Password vault name (for onepassword backend) */
  opVault?: string;
}
