import type { Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import type { ComprehensionUnit } from './types';
import { parseUnit, serializeUnit } from './serialize';

/** Filename of a per-module comprehension unit. */
export const UNIT_FILE = '_module.md';

/** Default committed root for the comprehension shard tree. */
export const COMPREHENSION_ROOT = '.harness/comprehension';

/**
 * Injected file IO for the comprehension shard tree (node-io.ts pattern).
 * Unlike the roadmap `ShardIO` (single-level `listDir`), comprehension is a
 * TREE, so unit discovery is a dedicated recursive `listUnitPaths(root)` — the
 * recursion lives in the adapter, keeping the store pure.
 */
export interface ComprehensionIO {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  /** `/`-normalized paths to every `_module.md` under `root` (recursive). */
  listUnitPaths(root: string): Promise<string[]>;
}

function joinPosix(...parts: string[]): string {
  return parts.join('/').replaceAll('\\', '/').replace(/\/+/g, '/');
}

/**
 * Tree-mirrored comprehension store: one `_module.md` per module directory under
 * `root`. Mirrors `ShardStore`'s IO-injected discipline (D5) — all fs access is
 * via the injected `ComprehensionIO`; the store itself is pure and testable.
 */
export class ComprehensionStore {
  private readonly root: string;
  private readonly io: ComprehensionIO;

  constructor(options: { root?: string; io: ComprehensionIO }) {
    this.root = (options.root ?? COMPREHENSION_ROOT).replaceAll('\\', '/');
    this.io = options.io;
  }

  /** Tree-mirrored on-disk path for a module (posix, Windows-safe). */
  path(module: string): string {
    return joinPosix(this.root, module.replaceAll('\\', '/'), UNIT_FILE);
  }

  async read(module: string): Promise<Result<ComprehensionUnit>> {
    let content: string;
    try {
      content = await this.io.readFile(this.path(module));
    } catch (err) {
      return Err(
        new Error(`Comprehension unit not found for "${module}": ${(err as Error).message}`)
      );
    }
    return parseUnit(content);
  }

  async write(unit: ComprehensionUnit): Promise<Result<void>> {
    try {
      await this.io.writeFile(this.path(unit.provenance.module), serializeUnit(unit));
    } catch (err) {
      return Err(
        new Error(
          `Failed to write comprehension unit "${unit.provenance.module}": ${(err as Error).message}`
        )
      );
    }
    return Ok(undefined);
  }

  async list(): Promise<Result<ComprehensionUnit[]>> {
    let paths: string[];
    try {
      paths = await this.io.listUnitPaths(this.root);
    } catch (err) {
      return Err(
        new Error(
          `Failed to list comprehension units under ${this.root}: ${(err as Error).message}`
        )
      );
    }
    const units: ComprehensionUnit[] = [];
    for (const p of [...paths].sort()) {
      let content: string;
      try {
        content = await this.io.readFile(p);
      } catch (err) {
        return Err(new Error(`Failed to read comprehension unit ${p}: ${(err as Error).message}`));
      }
      const parsed = parseUnit(content);
      if (!parsed.ok) return parsed;
      units.push(parsed.value);
    }
    return Ok(units);
  }
}
