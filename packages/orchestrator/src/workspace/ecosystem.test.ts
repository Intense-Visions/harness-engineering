import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  detectEcosystem,
  detectEcosystemFromFiles,
  ECOSYSTEM_RULES,
  type EcosystemId,
} from './ecosystem.js';

/**
 * Guards the language-aware workspace detector that feeds the local enforced gate.
 * Before this, verify shelled `pnpm -w run …` unconditionally and failed
 * ENVIRONMENTALLY for every non-JS workspace. The matcher is pure (files → descriptor)
 * so the priority order + fallback are asserted directly; a thin fs wrapper is
 * exercised against real fixture directories, one per ecosystem.
 */
describe('detectEcosystemFromFiles (pure matcher)', () => {
  const cases: ReadonlyArray<{ files: string[]; id: EcosystemId; pm: string }> = [
    { files: ['pnpm-lock.yaml', 'package.json'], id: 'node-pnpm', pm: 'pnpm' },
    { files: ['package-lock.json', 'package.json'], id: 'node-npm', pm: 'npm' },
    { files: ['npm-shrinkwrap.json'], id: 'node-npm', pm: 'npm' },
    { files: ['yarn.lock', 'package.json'], id: 'node-yarn', pm: 'yarn' },
    { files: ['package.json'], id: 'node-npm', pm: 'npm' },
    { files: ['uv.lock', 'pyproject.toml'], id: 'python-uv', pm: 'uv' },
    { files: ['poetry.lock', 'pyproject.toml'], id: 'python-poetry', pm: 'poetry' },
    { files: ['Pipfile.lock'], id: 'python-pipenv', pm: 'pipenv' },
    { files: ['Pipfile'], id: 'python-pipenv', pm: 'pipenv' },
    { files: ['requirements.txt'], id: 'python-pip', pm: 'pip' },
    { files: ['pyproject.toml'], id: 'python-pip', pm: 'pip' },
    { files: ['Cargo.toml'], id: 'rust-cargo', pm: 'cargo' },
    { files: ['Cargo.lock'], id: 'rust-cargo', pm: 'cargo' },
    { files: ['go.mod'], id: 'go', pm: 'go' },
    { files: ['go.sum'], id: 'go', pm: 'go' },
    { files: ['Gemfile'], id: 'ruby-bundler', pm: 'bundler' },
    { files: ['pom.xml'], id: 'java-maven', pm: 'maven' },
    { files: ['build.gradle'], id: 'java-gradle', pm: 'gradle' },
    { files: ['build.gradle.kts'], id: 'java-gradle', pm: 'gradle' },
  ];

  for (const { files, id, pm } of cases) {
    it(`[${files.join(', ')}] → ${id}`, () => {
      const eco = detectEcosystemFromFiles(files);
      expect(eco?.id).toBe(id);
      expect(eco?.packageManager).toBe(pm);
      expect(eco?.installCommand.length).toBeGreaterThan(0);
      expect(eco?.verifyCommands.length).toBeGreaterThan(0);
    });
  }

  it('returns null when no recognized marker is present (clean fallback)', () => {
    expect(detectEcosystemFromFiles(['README.md', 'LICENSE', 'src'])).toBeNull();
    expect(detectEcosystemFromFiles([])).toBeNull();
  });

  it('node wins over a co-present non-node manifest (harness JS-default bias)', () => {
    // A polyglot repo carrying a package.json for tooling still bootstraps as node.
    const eco = detectEcosystemFromFiles(['pyproject.toml', 'package.json']);
    expect(eco?.language).toBe('node');
  });

  it('a lockfile pins its package manager over a looser sibling manifest', () => {
    // uv.lock beats poetry.lock beats a bare pyproject.toml — most specific wins.
    expect(detectEcosystemFromFiles(['uv.lock', 'poetry.lock', 'pyproject.toml'])?.id).toBe(
      'python-uv'
    );
    expect(detectEcosystemFromFiles(['poetry.lock', 'pyproject.toml'])?.id).toBe('python-poetry');
  });

  it('accepts a Set as well as an array (no re-copy needed)', () => {
    expect(detectEcosystemFromFiles(new Set(['Cargo.toml']))?.id).toBe('rust-cargo');
  });

  it('non-node verify commands are whitespace-splittable (no shell required)', () => {
    for (const rule of ECOSYSTEM_RULES) {
      if (rule.ecosystem.language === 'node') continue;
      for (const cmd of rule.ecosystem.verifyCommands) {
        expect(cmd.trim()).toBe(cmd);
        expect(cmd.split(/\s+/).filter(Boolean).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('detectEcosystem (filesystem wrapper)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-ecosystem-'));
  });
  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  const write = (name: string): void => fs.writeFileSync(path.join(tmp, name), '');

  it('detects a Python (uv) fixture directory', () => {
    write('uv.lock');
    write('pyproject.toml');
    const eco = detectEcosystem(tmp);
    expect(eco?.id).toBe('python-uv');
    expect(eco?.installCommand).toBe('uv sync');
    expect(eco?.verifyCommands).toContain('uv run pytest');
  });

  it('detects a Rust (cargo) fixture directory', () => {
    write('Cargo.toml');
    const eco = detectEcosystem(tmp);
    expect(eco?.id).toBe('rust-cargo');
    expect(eco?.verifyCommands).toEqual(['cargo build', 'cargo test']);
  });

  it('detects a Go fixture directory', () => {
    write('go.mod');
    write('go.sum');
    expect(detectEcosystem(tmp)?.id).toBe('go');
  });

  it('detects a node (pnpm) fixture directory', () => {
    write('pnpm-lock.yaml');
    write('package.json');
    expect(detectEcosystem(tmp)?.id).toBe('node-pnpm');
  });

  it('an empty workspace directory → null (nothing to detect)', () => {
    expect(detectEcosystem(tmp)).toBeNull();
  });

  it('an unreadable/absent path → null (graceful degradation, no throw)', () => {
    expect(detectEcosystem(path.join(tmp, 'does-not-exist'))).toBeNull();
  });
});
