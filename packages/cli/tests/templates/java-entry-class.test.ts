import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TemplateEngine } from '../../src/templates/engine';
import { runCleanup } from '../../src/commands/cleanup';

/**
 * #2630 follow-up: a Spring Boot scaffold must ship exactly one main class.
 *
 * java-base renders `src/main/java/Main.java` and the spring-boot overlay
 * renders `src/main/java/Application.java`. Overlays only replace base files
 * at the SAME path, so a spring-boot scaffold shipped both: two `main`
 * methods, one of them dead. The overlay now declares the base files it
 * replaces (`replaces` in template.json) and the engine drops them.
 */

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');
const engine = new TemplateEngine(TEMPLATES_DIR);

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function renderJava(framework?: string): Map<string, string> {
  const resolved = engine.resolveTemplate(undefined, framework, 'java');
  if (!resolved.ok) throw new Error(resolved.error.message);
  const rendered = engine.render(resolved.value, {
    projectName: 'java-entry-test',
    language: 'java',
    ...(framework && { framework }),
  });
  if (!rendered.ok) throw new Error(rendered.error.message);
  return new Map(rendered.value.files.map((f) => [f.relativePath, f.content]));
}

function javaSources(files: Map<string, string>): string[] {
  return [...files.keys()].filter((p) => p.endsWith('.java')).sort();
}

function writeScaffold(files: Map<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-java-entry-'));
  tmpDirs.push(dir);
  for (const [rel, content] of files) {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  // Language-base templates ship entropy.enabled: false (#2633); opt in so
  // dead-code actually runs, as an adopter turning the analyzers on would.
  const configPath = path.join(dir, 'harness.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  config.entropy = { ...config.entropy, enabled: true };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return dir;
}

async function deadCode(dir: string): Promise<string[]> {
  const result = await runCleanup({
    cwd: dir,
    configPath: path.join(dir, 'harness.config.json'),
    type: 'dead-code',
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.deadCode.map((d) => path.relative(dir, d.file).split(path.sep).join('/'));
}

describe('java scaffolds ship exactly one main class (#2630)', () => {
  it('java-base alone renders Main.java only', () => {
    expect(javaSources(renderJava())).toEqual(['src/main/java/Main.java']);
  });

  it('java-base + spring-boot renders Application.java only', () => {
    expect(javaSources(renderJava('spring-boot'))).toEqual(['src/main/java/Application.java']);
  });

  it('declares no entryPoints that name a file the scaffold does not ship', () => {
    for (const framework of [undefined, 'spring-boot']) {
      const files = renderJava(framework);
      const config = JSON.parse(files.get('harness.config.json')!);
      const declared: string[] = [
        ...(config.entropy?.entryPoints ?? []),
        ...(config.performance?.entryPoints ?? []),
      ];
      for (const entry of declared) expect(files.has(entry)).toBe(true);
    }
  });

  it.each([
    ['java-base', undefined],
    ['spring-boot', 'spring-boot'],
  ])(
    '%s: dead-code reports nothing on a fresh scaffold',
    async (_label, framework) => {
      expect(await deadCode(writeScaffold(renderJava(framework)))).toEqual([]);
    },
    30_000
  );

  it.each([
    ['java-base', undefined],
    ['spring-boot', 'spring-boot'],
  ])(
    '%s: dead-code still reports a genuinely unused class (positive control)',
    async (_label, framework) => {
      const dir = writeScaffold(renderJava(framework));
      fs.writeFileSync(path.join(dir, 'src/main/java/Orphan.java'), 'public class Orphan {}\n');
      expect(await deadCode(dir)).toContain('src/main/java/Orphan.java');
    },
    30_000
  );
});

describe('template.json `replaces`', () => {
  function fixture(overlayMeta: Record<string, unknown>): TemplateEngine {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-replaces-'));
    tmpDirs.push(root);
    const write = (rel: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), content);
    };
    write(
      'java-base/template.json',
      JSON.stringify({ name: 'java-base', description: 'b', version: 1, language: 'java' })
    );
    write('java-base/Main.java.hbs', 'class Main {}\n');
    write('java-base/keep.txt', 'keep\n');
    write(
      'overlay/template.json',
      JSON.stringify({
        name: 'overlay',
        description: 'o',
        version: 1,
        language: 'java',
        framework: 'fw',
        ...overlayMeta,
      })
    );
    write('overlay/App.java', 'class App {}\n');
    return new TemplateEngine(root);
  }

  it('drops the named base file and keeps the rest', () => {
    const resolved = fixture({ replaces: ['Main.java'] }).resolveTemplate(undefined, 'fw', 'java');
    if (!resolved.ok) throw new Error(resolved.error.message);
    expect(resolved.value.files.map((f) => f.relativePath).sort()).toEqual([
      'App.java',
      'keep.txt',
    ]);
  });

  it('keeps every base file when the overlay replaces nothing (control)', () => {
    const resolved = fixture({}).resolveTemplate(undefined, 'fw', 'java');
    if (!resolved.ok) throw new Error(resolved.error.message);
    expect(resolved.value.files.map((f) => f.relativePath).sort()).toEqual([
      'App.java',
      'Main.java.hbs',
      'keep.txt',
    ]);
  });

  it('fails loudly when a replaced file does not exist in the base', () => {
    const resolved = fixture({ replaces: ['Gone.java'] }).resolveTemplate(undefined, 'fw', 'java');
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error.message).toMatch(/Gone\.java/);
  });
});
