/**
 * `AdvisoryInstallAdapter` — install adapter for backends whose lifecycle is
 * operator-driven (D4).
 *
 * LM Studio, vLLM, and llama.cpp expose either no scriptable management API or
 * one that is too unstable for unattended use today. For those, LMLM does not
 * pretend to install models — instead, the dashboard / CLI surfaces a
 * copy-paste command that the operator runs. The adapter therefore:
 *
 *   - `renderCommand({ name })` returns the backend-specific shell command.
 *   - `install` / `evict` reject with `InstallError('advisory_only', …)` so the
 *     Phase 3c manager can short-circuit cleanly. The manager surfaces the
 *     copy-paste command to the operator and leaves pool state untouched.
 *   - `list` returns `[]`. The `LocalModelResolver` probe loop is authoritative
 *     for advisory backends; the manager never tries to drift-reconcile an
 *     advisory pool.
 *   - `inspect` rejects with `advisory_only`. The manager never trusts a
 *     fabricated `sizeOnDiskGb` against the disk budget.
 *
 * @see docs/changes/local-model-lifecycle-manager/proposal.md (D4, line 53)
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

/** Advisory backends LMLM recognizes today. New backends extend the union. */
export type AdvisoryBackend = 'lmstudio' | 'vllm' | 'llamacpp';

export interface AdvisoryInstallAdapterOptions {
  backend: AdvisoryBackend;
}

export interface AdvisoryRenderRequest {
  name: string;
}

export class AdvisoryInstallAdapter implements InstallAdapter {
  readonly backend: AdvisoryBackend;

  constructor(options: AdvisoryInstallAdapterOptions) {
    this.backend = options.backend;
  }

  /**
   * Render the copy-paste install command for the configured backend. The
   * command is the operator's contract — the dashboard / CLI render it
   * verbatim. The name is shell-quoted on the way out so a hostile-looking
   * model id can't break the rendering.
   */
  renderCommand(request: AdvisoryRenderRequest): string {
    const safeName = shellQuote(request.name);
    switch (this.backend) {
      case 'lmstudio':
        return `lms get ${safeName}`;
      case 'vllm':
        return `vllm serve ${safeName}`;
      case 'llamacpp':
        return `llama-server -m ${safeName}`;
      default:
        // Defensive — exhaustive over `AdvisoryBackend`, but a future variant
        // would otherwise compile through this method silently.
        throw new InstallError(
          'advisory_only',
          `advisory install command unknown for backend ${String(this.backend)}`,
          { target: request.name }
        );
    }
  }

  install(request: InstallRequest): Promise<InstallResult> {
    return Promise.reject(
      new InstallError(
        'advisory_only',
        `install is operator-driven for backend ${this.backend}; run \`${this.renderCommand(request)}\``,
        { target: request.name }
      )
    );
  }

  evict(request: EvictRequest): Promise<InstallResult> {
    return Promise.reject(
      new InstallError(
        'advisory_only',
        `evict is operator-driven for backend ${this.backend}; remove the model manually`,
        { target: request.name }
      )
    );
  }

  list(_request: ListRequest = {}): Promise<RemoteModelInfo[]> {
    return Promise.resolve([]);
  }

  inspect(request: InspectRequest): Promise<RemoteModelInfo> {
    return Promise.reject(
      new InstallError('advisory_only', `inspect is operator-driven for backend ${this.backend}`, {
        target: request.name,
      })
    );
  }
}

/**
 * Minimal shell-safe quoting. `name` is operator-supplied (or comes from a
 * pool entry the operator approved), but rendering it inside a copy-paste
 * command — that a human eyeballs and runs — still benefits from explicit
 * quoting so spaces / globs / shell metacharacters don't surprise.
 *
 * For ids that are already a single token of `[A-Za-z0-9._:/-]`, the function
 * returns the input unchanged so the rendered command stays idiomatic.
 */
function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  if (/^[A-Za-z0-9._:/-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
