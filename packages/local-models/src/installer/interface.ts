/**
 * Installer — interface re-exports + null adapter test helper.
 *
 * `InstallAdapter`, the discriminated `InstallResult`, the streaming
 * `InstallEvent`, and the supporting request shapes are defined in `types.ts`;
 * this file re-exports the interface (`export type`) and ships a
 * `nullInstallAdapter()` factory whose methods reject with `InstallError`.
 *
 * The null adapter lets Phase 3c's `PoolManager` tests stand up a manager
 * against a stable target when the test scenario does not exercise install /
 * evict (e.g. allowlist enforcement tests, eviction-only paths). It also
 * becomes the manager's default when `localModels.enabled = false`, so
 * accidental invocations surface as a structured `installer_unavailable`
 * error rather than an unhandled `undefined` method call.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (Phase 3, lines 431–443)
 */

import { InstallError } from './errors.js';
import type {
  EvictRequest,
  InspectRequest,
  InstallAdapter,
  InstallRequest,
  InstallResult,
  ListRequest,
  RemoteModelInfo,
} from './types.js';

export type {
  EvictRequest,
  InspectRequest,
  InstallAdapter,
  InstallEvent,
  InstallErrorCode,
  InstallRequest,
  InstallResult,
  InstallerFetchResponse,
  InstallerFetcher,
  ListRequest,
  RemoteModelInfo,
} from './types.js';

const NULL_MESSAGE = 'null adapter — install backend not configured';

/**
 * Factory for an `InstallAdapter` whose methods always reject with
 * `InstallError('installer_unavailable', …)`. Useful as a default target when
 * LMLM is disabled or as a test seam where the scenario does not exercise the
 * install path.
 */
export function nullInstallAdapter(): InstallAdapter {
  return {
    install(request: InstallRequest): Promise<InstallResult> {
      return Promise.reject(
        new InstallError('installer_unavailable', NULL_MESSAGE, { target: request.name })
      );
    },
    evict(request: EvictRequest): Promise<InstallResult> {
      return Promise.reject(
        new InstallError('installer_unavailable', NULL_MESSAGE, { target: request.name })
      );
    },
    list(_request: ListRequest = {}): Promise<RemoteModelInfo[]> {
      return Promise.reject(new InstallError('installer_unavailable', NULL_MESSAGE));
    },
    inspect(request: InspectRequest): Promise<RemoteModelInfo> {
      return Promise.reject(
        new InstallError('installer_unavailable', NULL_MESSAGE, { target: request.name })
      );
    },
  };
}
