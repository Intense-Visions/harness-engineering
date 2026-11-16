import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TemplateEngine } from '../../src/templates/engine';
import { runCleanup } from '../../src/commands/cleanup';

/**
 * #2630 (d): a fresh framework scaffold must not report its own conventional
 * entry files as dead code.
 *
 * Frameworks load files by convention, not by import: Vite reads
 * `vite.config.ts` and `index.html` pulls in `src/main.tsx`, Next.js loads
 * `next.config.mjs` and every `app/` route file, Django runs `manage.py` and
 * resolves `settings`/`urls`/`wsgi` from strings, ESLint reads
 * `eslint.config.mjs`. None of them has an importer, so reachability from a
 * single auto-detected root reported every one of them on day one. Each
 * template now declares the entry files it ships in `entropy.entryPoints`, and
 * the overlay merge unions those lists so a framework overlay composes with
 * whichever level it is rendered over.
 *
 * End-to-end on purpose: render the real templates, write them to disk, and
 * run the real `harness cleanup -t dead-code` path that reads the rendered
 * `harness.config.json` — a static read of the `.hbs` files could not see a
 * merge that drops an entry or a declared path that is not rendered.
 */

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
const engine = new TemplateEngine(TEMPLATES_DIR);

const TS_LEVELS = ['basic', 'intermediate', 'load-bearing-minimum', 'advanced'] as const;
const TS_FRAMEWORKS = ['express', 'nestjs', 'nextjs', 'react-vite', 'vue'] as const;

interface Scaffold {
  label: string;
  level?: (typeof TS_LEVELS)[number];
  framework?: string;
  language?: string;
  /** A genuinely unused source file for the positive control. */
  orphan: { file: string; content: string };
}

const TS_ORPHAN = { file: 'src/orphan.ts', content: 'export const orphan = 1;\n' };
const PY_ORPHAN = { file: 'src/orphan.py', content: 'def orphan():\n    return 1\n' };

const SCAFFOLDS: Scaffold[] = [
  ...TS_LEVELS.map((level) => ({ label: level, level, orphan: TS_ORPHAN })),
  ...TS_LEVELS.flatMap((level) =>
    TS_FRAMEWORKS.map((framework) => ({
      label: `${framework} over ${level}`,
      level,
      framework,
      orphan: TS_ORPHAN,
    }))
  ),
  { label: 'django', framework: 'django', language: 'python', orphan: PY_ORPHAN },
  { label: 'fastapi', framework: 'fastapi', language: 'python', orphan: PY_ORPHAN },
];

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function scaffold(s: Scaffold): string {
  const resolved = engine.resolveTemplate(s.level, s.framework, s.language);
  if (!resolved.ok) throw new Error(resolved.error.message);
  const rendered = engine.render(resolved.value, {
    projectName: 'entry-points-test',
    ...(s.level && { level: s.level }),
    ...(s.framework && { framework: s.framework }),
    ...(s.language && { language: s.language }),
  });
  if (!rendered.ok) throw new Error(rendered.error.message);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-entry-points-'));
  tmpDirs.push(dir);
  for (const file of rendered.value.files) {
    const target = path.join(dir, file.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  return dir;
}

/** Dead-code findings, as project-relative POSIX paths (stable on win32). */
async function deadCode(dir: string): Promise<string[]> {
  const result = await runCleanup({
    cwd: dir,
    configPath: path.join(dir, 'harness.config.json'),
    type: 'dead-code',
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.deadCode.map((d) => {
    const rel = path.relative(dir, d.file).split(path.sep).join('/');
    return d.symbol ? `${rel}#${d.symbol}` : rel;
  });
}

describe('fresh framework scaffolds report no dead code on their entry files (#2630)', () => {
  describe.each(SCAFFOLDS)('$label', (s) => {
    it('reports nothing on the files the framework loads by convention', async () => {
      expect(await deadCode(scaffold(s))).toEqual([]);
    }, 30_000);

    it('still reports a genuinely unused source file (positive control)', async () => {
      const dir = scaffold(s);
      fs.writeFileSync(path.join(dir, s.orphan.file), s.orphan.content);
      expect(await deadCode(dir)).toContain(s.orphan.file);
    }, 30_000);
  });
});

describe('a written harness.config.json names only entry files that exist (#2630)', () => {
  function writeReactVite(dir: string, existingProject: boolean) {
    const resolved = engine.resolveTemplate('load-bearing-minimum', 'react-vite');
    if (!resolved.ok) throw new Error(resolved.error.message);
    const rendered = engine.render(resolved.value, {
      projectName: 'entry-points-test',
      level: 'load-bearing-minimum',
      framework: 'react-vite',
    });
    if (!rendered.ok) throw new Error(rendered.error.message);
    const written = engine.write(rendered.value, dir, { overwrite: false, existingProject });
    if (!written.ok) throw new Error(written.error.message);
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'harness.config.json'), 'utf-8'));
    return config.entropy?.entryPoints as string[] | undefined;
  }

  function tmp(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-entry-write-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('keeps every declared entry on a fresh scaffold', () => {
    expect(writeReactVite(tmp(), false)).toEqual([
      'src/index.ts',
      'eslint.config.mjs',
      'vite.config.ts',
      'src/main.tsx',
    ]);
  });

  it('drops entries the write skipped in an existing project, keeping the ones it has', () => {
    // Existing project: only harness config files are written, so the
    // scaffold's entry files are absent unless the project already has them.
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'vite.config.ts'), 'export default {};\n');
    expect(writeReactVite(dir, true)).toEqual(['vite.config.ts']);
  });

  it('removes the key when none exist, so auto-detection takes over', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    expect(writeReactVite(dir, true)).toBeUndefined();
  });

  it('never edits a harness.config.json the project already had', () => {
    const dir = tmp();
    const own = { entropy: { entryPoints: ['does/not/exist.ts'] } };
    fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(own));
    expect(writeReactVite(dir, true)).toEqual(['does/not/exist.ts']);
  });
});
