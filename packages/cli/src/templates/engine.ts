import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { TemplateMetadataSchema, type TemplateMetadata } from './schema';
import { deepMergeJson, mergePackageJson } from './merger';

export interface TemplateContext {
  projectName: string;
  level?: string;
  framework?: string;
  language?: string;
  goModulePath?: string;
  pythonMinVersion?: string;
  javaGroupId?: string;
  rustEdition?: string;
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

export interface DetectedFramework {
  framework: string;
  language: string;
  score: number;
  templateName: string;
}

interface WriteOptions {
  overwrite: boolean;
  language?: string;
}

export interface WriteResult {
  written: string[];
  skippedConfigs: string[];
}

const NON_JSON_PACKAGE_CONFIGS = new Set(['pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml']);

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
      return Err(
        new Error(
          `Failed to list templates: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  resolveTemplate(
    level?: string,
    framework?: string,
    language?: string
  ): Result<ResolvedTemplate, Error> {
    // Non-JS language path: language-base -> optional framework overlay
    if (language && language !== 'typescript') {
      return this.resolveLanguageTemplate(language, framework);
    }

    // Existing JS/TS path: requires level
    if (!level) {
      return Err(new Error('Level is required for TypeScript/JavaScript templates'));
    }

    const levelDir = this.findTemplateDir(level, 'level');
    if (!levelDir) return Err(new Error(`Template not found for level: ${level}`));

    const metaPath = path.join(levelDir, 'template.json');
    const metaRaw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const metaResult = TemplateMetadataSchema.safeParse(metaRaw);
    if (!metaResult.success)
      return Err(new Error(`Invalid template.json in ${level}: ${metaResult.error.message}`));

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
    // Provide language-specific defaults for optional Handlebars variables
    const effectiveContext: TemplateContext = {
      ...context,
      ...(context.language === 'python' &&
        context.pythonMinVersion === undefined && { pythonMinVersion: '3.10' }),
      ...(context.language === 'go' &&
        context.goModulePath === undefined && {
          goModulePath: `github.com/example/${context.projectName}`,
        }),
      ...(context.language === 'java' &&
        context.javaGroupId === undefined && {
          javaGroupId: `com.example.${context.projectName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`,
        }),
      ...(context.language === 'rust' &&
        context.rustEdition === undefined && { rustEdition: '2021' }),
    };
    const rendered: RenderedFile[] = [];
    const jsonBuffers = new Map<string, Record<string, unknown>[]>();

    for (const file of template.files) {
      const outputPath = file.relativePath.replace(/\.hbs$/, '');
      if (file.isHandlebars) {
        try {
          const raw = fs.readFileSync(file.absolutePath, 'utf-8');
          const compiled = Handlebars.compile(raw, { strict: true });
          const content = compiled(effectiveContext);
          if (outputPath.endsWith('.json') && file.relativePath.endsWith('.json.hbs')) {
            if (!jsonBuffers.has(outputPath)) jsonBuffers.set(outputPath, []);
            jsonBuffers.get(outputPath)!.push(JSON.parse(content));
          } else {
            rendered.push({ relativePath: outputPath, content });
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return Err(
            new Error(
              `Template render failed in ${file.sourceTemplate}/${file.relativePath}: ${msg}`
            )
          );
        }
      } else {
        try {
          const content = fs.readFileSync(file.absolutePath, 'utf-8');
          rendered.push({ relativePath: file.relativePath, content });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return Err(
            new Error(
              `Template render failed in ${file.sourceTemplate}/${file.relativePath}: ${msg}`
            )
          );
        }
      }
    }

    try {
      for (const [outputPath, jsons] of jsonBuffers) {
        let merged: Record<string, unknown> = {};
        for (const json of jsons) {
          merged =
            outputPath === 'package.json'
              ? mergePackageJson(merged, json)
              : deepMergeJson(merged, json);
        }
        rendered.push({ relativePath: outputPath, content: JSON.stringify(merged, null, 2) });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return Err(new Error(`JSON merge failed: ${msg}`));
    }

    return Ok({ files: rendered });
  }

  write(
    files: RenderedFiles,
    targetDir: string,
    options: WriteOptions
  ): Result<WriteResult, Error> {
    try {
      const written: string[] = [];
      const skippedConfigs: string[] = [];
      const isNonJsLanguage = options.language && options.language !== 'typescript';

      for (const file of files.files) {
        const targetPath = path.join(targetDir, file.relativePath);
        const dir = path.dirname(targetPath);

        // Skip non-JSON package configs for non-JS languages when file already exists
        if (
          !options.overwrite &&
          isNonJsLanguage &&
          NON_JSON_PACKAGE_CONFIGS.has(file.relativePath) &&
          fs.existsSync(targetPath)
        ) {
          skippedConfigs.push(file.relativePath);
          continue;
        }

        if (!options.overwrite && fs.existsSync(targetPath)) continue;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(targetPath, file.content);
        written.push(file.relativePath);
      }
      return Ok({ written, skippedConfigs });
    } catch (error) {
      return Err(
        new Error(
          `Failed to write files: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  detectFramework(targetDir: string): Result<DetectedFramework[], Error> {
    try {
      const templatesResult = this.listTemplates();
      if (!templatesResult.ok) return Err(templatesResult.error);

      const candidates: DetectedFramework[] = [];

      for (const meta of templatesResult.value) {
        if (!meta.detect || meta.detect.length === 0) continue;
        if (!meta.framework || !meta.language) continue;

        let score = 0;
        for (const pattern of meta.detect) {
          const filePath = path.join(targetDir, pattern.file);
          if (!fs.existsSync(filePath)) continue;
          if (pattern.contains) {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (content.includes(pattern.contains)) score++;
          } else {
            score++;
          }
        }

        if (score > 0) {
          candidates.push({
            framework: meta.framework,
            language: meta.language,
            score,
            templateName: meta.name,
          });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      return Ok(candidates);
    } catch (error) {
      return Err(
        new Error(
          `Framework detection failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  private resolveLanguageTemplate(
    language: string,
    framework?: string
  ): Result<ResolvedTemplate, Error> {
    const baseName = `${language}-base`;
    const baseDir = this.findTemplateDir(baseName, 'name');
    if (!baseDir) return Err(new Error(`Language base template not found: ${baseName}`));

    const metaPath = path.join(baseDir, 'template.json');
    const metaRaw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const metaResult = TemplateMetadataSchema.safeParse(metaRaw);
    if (!metaResult.success)
      return Err(new Error(`Invalid template.json in ${baseName}: ${metaResult.error.message}`));

    const metadata = metaResult.data;
    let files = this.collectFiles(baseDir, baseName);

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

  private findTemplateDir(name: string, type: 'level' | 'framework' | 'name'): string | null {
    const entries = fs.readdirSync(this.templatesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(this.templatesDir, entry.name, 'template.json');
      if (!fs.existsSync(metaPath)) continue;
      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const parsed = TemplateMetadataSchema.safeParse(raw);
      if (!parsed.success) continue;
      if (type === 'level' && parsed.data.level === name)
        return path.join(this.templatesDir, entry.name);
      if (type === 'framework' && parsed.data.framework === name)
        return path.join(this.templatesDir, entry.name);
      if (type === 'name' && parsed.data.name === name)
        return path.join(this.templatesDir, entry.name);
    }
    return null;
  }

  private collectFiles(dir: string, sourceName: string): TemplateFile[] {
    const files: TemplateFile[] = [];
    const walk = (currentDir: string): void => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          files.push({
            relativePath: path.relative(dir, fullPath).replace(/\\/g, '/'),
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
