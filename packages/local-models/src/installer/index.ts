/**
 * Installer — public barrel.
 *
 * Phase 3b ships the install-adapter contract plus two concrete
 * implementations (Ollama REST + advisory copy-paste). Phase 3c's
 * `PoolManager` is the first non-test consumer.
 *
 * The interface itself lives in `types.ts`; `interface.ts` re-exports the
 * type and ships the `nullInstallAdapter` helper.
 */

export { InstallError, isInstallError } from './errors.js';
export type { InstallErrorJson, InstallErrorOptions } from './errors.js';

export { OllamaInstallAdapter } from './ollama.js';
export type { OllamaInstallAdapterOptions } from './ollama.js';

export { AdvisoryInstallAdapter } from './advisory.js';
export type {
  AdvisoryBackend,
  AdvisoryInstallAdapterOptions,
  AdvisoryRenderRequest,
} from './advisory.js';

export { nullInstallAdapter } from './interface.js';
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
} from './interface.js';
