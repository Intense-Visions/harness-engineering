import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { TemplateMetadataSchema, type TemplateMetadata } from './schema';
import { deepMergeJson, mergePackageJson } from './merger';

export interface TemplateContext {
  projectName: string;
  level: string;
  framework?: string;
}

interface TemplateFile {
  relativePath: string;
  absolutePath: string;
  isHandlebars: boolean;
  sourceTemplate: string;
}

export interface ResolvedTemplate {
  metadata: TemplateMetadata;
  files: TemplateFile[];
  overlayMetadata?: TemplateMetadata;
}

interface RenderedFile {
  relativePath: string;
  content: string;
}

export interface RenderedFiles {
  files: RenderedFile[];
}

interface WriteOptions {
  overwrite: boolean;
}

export class TemplateEngine {
  constructor(private templatesDir: string) {}

  listTemplates(): Result<TemplateMetadata[], Error> {
    try {
      const entries = fs.readdirSync(this.templatesDir, { withFileTypes: true });
      const templates: TemplateMetadata[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metaPath = path.join(this.templatesDir, entry.name, 'template.json');
        if (!fs.existsSync(metaPath)) continue;
        const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const parsed = TemplateMetadataSchema.safeParse(raw);
        if (parsed.success) templates.push(parsed.data);
      }
      return Ok(templates);
    } catch (error) {
      return Err(new Error(`Failed to list templates: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  resolveTemplate(level: string, framework?: string): Result<ResolvedTemplate, Error> {
    const levelDir = this.findTemplateDir(level, 'level');
    if (!levelDir) return Err(new Error(`Template not found for level: ${level}`));

    const metaPath = path.join(levelDir, 'template.json');
    const metaRaw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const metaResult = TemplateMetadataSchema.safeParse(metaRaw);
    if (!metaResult.success) return Err(new Error(`Invalid template.json in ${level}: ${metaResult.error.message}`));

    const metadata = metaResult.data;
    let files: TemplateFile[] = [];

    if (metadata.extends) {
      const baseDir = path.join(this.templatesDir, metadata.extends);
      if (fs.existsSync(baseDir)) files = this.collectFiles(baseDir, metadata.extends);
    }

    const levelFiles = this.collectFiles(levelDir, level);
    files = this.mergeFileLists(files, levelFiles);

    let overlayMetadata: TemplateMetadata | undefined;
    if (framework) {
      const frameworkDir = this.findTemplateDir(framework, 'framework');
      if (!frameworkDir) return Err(new Error(`Framework template not found: ${framework}`));
      const fMetaPath = path.join(frameworkDir, 'template.json');
      const fMetaRaw = JSON.parse(fs.readFileSync(fMetaPath, 'utf-8'));
      const fMetaResult = TemplateMetadataSchema.safeParse(fMetaRaw);
      if (fMetaResult.success) overlayMetadata = fMetaResult.data;
      const frameworkFiles = this.collectFiles(frameworkDir, framework);
      files = this.mergeFileLists(files, frameworkFiles);
    }

    files = files.filter((f) => f.relativePath !== 'template.json');
    const resolved: ResolvedTemplate = { metadata, files };
    if (overlayMetadata !== undefined) resolved.overlayMetadata = overlayMetadata;
    return Ok(resolved);
  }

  render(template: ResolvedTemplate, context: TemplateContext): Result<RenderedFiles, Error> {
    const rendered: RenderedFile[] = [];
    const jsonBuffers = new Map<string, Record<string, unknown>[]>();

    for (const file of template.files) {
      const outputPath = file.relativePath.replace(/\.hbs$/, '');
      if (file.isHandlebars) {
        try {
          const raw = fs.readFileSync(file.absolutePath, 'utf-8');
          const compiled = Handlebars.compile(raw, { strict: true });
          const content = compiled(context);
          if (outputPath.endsWith('.json') && file.relativePath.endsWith('.json.hbs')) {
            if (!jsonBuffers.has(outputPath)) jsonBuffers.set(outputPath, []);
            jsonBuffers.get(outputPath)!.push(JSON.parse(content));
          } else {
            rendered.push({ relativePath: outputPath, content });
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return Err(new Error(`Template render failed in ${file.sourceTemplate}/${file.relativePath}: ${msg}`));
        }
      } else {
        try {
          const content = fs.readFileSync(file.absolutePath, 'utf-8');
          rendered.push({ relativePath: file.relativePath, content });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return Err(new Error(`Template render failed in ${file.sourceTemplate}/${file.relativePath}: ${msg}`));
        }
      }
    }

    try {
      for (const [outputPath, jsons] of jsonBuffers) {
        let merged: Record<string, unknown> = {};
        for (const json of jsons) {
          merged = outputPath === 'package.json' ? mergePackageJson(merged, json) : deepMergeJson(merged, json);
        }
        rendered.push({ relativePath: outputPath, content: JSON.stringify(merged, null, 2) });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return Err(new Error(`JSON merge failed: ${msg}`));
    }

    return Ok({ files: rendered });
  }

  write(files: RenderedFiles, targetDir: string, options: WriteOptions): Result<string[], Error> {
    try {
      const written: string[] = [];
      for (const file of files.files) {
        const targetPath = path.join(targetDir, file.relativePath);
        const dir = path.dirname(targetPath);
        if (!options.overwrite && fs.existsSync(targetPath)) continue;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(targetPath, file.content);
        written.push(file.relativePath);
      }
      return Ok(written);
    } catch (error) {
      return Err(new Error(`Failed to write files: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private findTemplateDir(name: string, type: 'level' | 'framework'): string | null {
    const entries = fs.readdirSync(this.templatesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(this.templatesDir, entry.name, 'template.json');
      if (!fs.existsSync(metaPath)) continue;
      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const parsed = TemplateMetadataSchema.safeParse(raw);
      if (!parsed.success) continue;
      if (type === 'level' && parsed.data.level === name) return path.join(this.templatesDir, entry.name);
      if (type === 'framework' && parsed.data.framework === name) return path.join(this.templatesDir, entry.name);
      if (parsed.data.name === name) return path.join(this.templatesDir, entry.name);
    }
    return null;
  }

  private collectFiles(dir: string, sourceName: string): TemplateFile[] {
    const files: TemplateFile[] = [];
    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          files.push({
            relativePath: path.relative(dir, fullPath),
            absolutePath: fullPath,
            isHandlebars: entry.name.endsWith('.hbs'),
            sourceTemplate: sourceName,
          });
        }
      }
    };
    walk(dir);
    return files;
  }

  private mergeFileLists(base: TemplateFile[], overlay: TemplateFile[]): TemplateFile[] {
    const map = new Map<string, TemplateFile>();
    for (const file of base) map.set(file.relativePath, file);
    for (const file of overlay) {
      if (file.relativePath.endsWith('.json.hbs')) {
        const baseKey = base.find((f) => f.relativePath === file.relativePath);
        if (baseKey) {
          map.set(`__overlay__${file.relativePath}`, file);
        } else {
          map.set(file.relativePath, file);
        }
      } else {
        map.set(file.relativePath, file);
      }
    }
    return Array.from(map.values());
  }
}
