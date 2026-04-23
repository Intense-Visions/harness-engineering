import { hash } from '../ingestUtils.js';
import type { ExtractionRecord, Language, SignalExtractor } from './types.js';

/**
 * Extracts API route definitions revealing the domain model.
 * Finds Express/Hono routes (TS/JS), FastAPI/Flask decorators (Python),
 * Gin/Echo/http handlers (Go), Actix macros (Rust), Spring annotations (Java).
 */
export class ApiPathExtractor implements SignalExtractor {
  readonly name = 'api-paths';
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];

  extract(content: string, filePath: string, language: Language): ExtractionRecord[] {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return this.extractJsTs(content, filePath, language);
      case 'python':
        return this.extractPython(content, filePath, language);
      case 'go':
        return this.extractGo(content, filePath, language);
      case 'rust':
        return this.extractRust(content, filePath, language);
      case 'java':
        return this.extractJava(content, filePath, language);
    }
  }

  private extractJsTs(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    // Express/Hono/Fastify patterns: app.get('/path', ...) or router.get('/path', ...)
    const routePattern =
      /(?:app|router|server|fastify)\.(get|post|put|patch|delete|head|options)\s*\(\s*(['"`])([^'"`]+)\2/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const match = line.match(routePattern);
      if (match) {
        const method = match[1]!.toUpperCase();
        const routePath = match[3]!;
        const patternKey = `${method} ${routePath}`;

        records.push({
          id: `extracted:api-paths:${hash(filePath + ':' + patternKey)}`,
          extractor: 'api-paths',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_process',
          name: patternKey,
          content: `${method} ${routePath}`,
          confidence: 0.9,
          metadata: { method, path: routePath, framework: 'express' },
        });
      }
    }

    return records;
  }

  private extractPython(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    // FastAPI/Flask decorator patterns: @app.get("/path") or @router.get("/path")
    const decoratorPattern =
      /@(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*["']([^"']+)["']/i;

    // Flask @app.route pattern
    const flaskPattern =
      /@(?:app|blueprint)\.route\s*\(\s*["']([^"']+)["'](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const fastApiMatch = line.match(decoratorPattern);
      if (fastApiMatch) {
        const method = fastApiMatch[1]!.toUpperCase();
        const routePath = fastApiMatch[2]!;
        const patternKey = `${method} ${routePath}`;

        records.push({
          id: `extracted:api-paths:${hash(filePath + ':' + patternKey)}`,
          extractor: 'api-paths',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_process',
          name: patternKey,
          content: `${method} ${routePath}`,
          confidence: 0.9,
          metadata: { method, path: routePath, framework: 'fastapi' },
        });
        continue;
      }

      const flaskMatch = line.match(flaskPattern);
      if (flaskMatch) {
        const routePath = flaskMatch[1]!;
        const methods = flaskMatch[2]
          ? flaskMatch[2].split(',').map((m) => m.trim().replace(/["']/g, ''))
          : ['GET'];

        for (const method of methods) {
          const patternKey = `${method} ${routePath}`;
          records.push({
            id: `extracted:api-paths:${hash(filePath + ':' + patternKey)}`,
            extractor: 'api-paths',
            language,
            filePath,
            line: i + 1,
            nodeType: 'business_process',
            name: patternKey,
            content: `${method} ${routePath}`,
            confidence: 0.9,
            metadata: { method, path: routePath, framework: 'flask' },
          });
        }
      }
    }

    return records;
  }

  private extractGo(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    // Gin/Echo/Chi pattern: r.GET("/path", handler)
    const ginPattern = /(?:\w+)\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(\s*"([^"]+)"/i;

    // http.HandleFunc pattern
    const httpPattern = /http\.HandleFunc\s*\(\s*"([^"]+)"/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const ginMatch = line.match(ginPattern);
      if (ginMatch) {
        const method = ginMatch[1]!.toUpperCase();
        const routePath = ginMatch[2]!;
        const patternKey = `${method} ${routePath}`;

        records.push({
          id: `extracted:api-paths:${hash(filePath + ':' + patternKey)}`,
          extractor: 'api-paths',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_process',
          name: patternKey,
          content: `${method} ${routePath}`,
          confidence: 0.9,
          metadata: { method, path: routePath, framework: 'gin' },
        });
        continue;
      }

      const httpMatch = line.match(httpPattern);
      if (httpMatch) {
        const routePath = httpMatch[1]!;
        const patternKey = `ANY ${routePath}`;

        records.push({
          id: `extracted:api-paths:${hash(filePath + ':' + patternKey)}`,
          extractor: 'api-paths',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_process',
          name: patternKey,
          content: `ANY ${routePath}`,
          confidence: 0.6,
          metadata: { method: 'ANY', path: routePath, framework: 'net/http' },
        });
      }
    }

    return records;
  }

  private extractRust(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    // Actix macro patterns: #[get("/path")]
    const actixPattern = /#\[(get|post|put|patch|delete|head|options)\s*\(\s*"([^"]+)"\s*\)\s*\]/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const match = line.match(actixPattern);
      if (match) {
        const method = match[1]!.toUpperCase();
        const routePath = match[2]!;
        const patternKey = `${method} ${routePath}`;

        records.push({
          id: `extracted:api-paths:${hash(filePath + ':' + patternKey)}`,
          extractor: 'api-paths',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_process',
          name: patternKey,
          content: `${method} ${routePath}`,
          confidence: 0.9,
          metadata: { method, path: routePath, framework: 'actix' },
        });
      }
    }

    return records;
  }

  private extractJava(content: string, filePath: string, language: Language): ExtractionRecord[] {
    const records: ExtractionRecord[] = [];
    const lines = content.split('\n');

    // Spring annotation patterns
    const springPattern =
      /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/;

    // Base path from @RequestMapping on class
    let basePath = '';
    for (const line of lines) {
      const baseMatch = line.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']\s*\)/);
      if (baseMatch && line.match(/class\s/) === null) {
        basePath = baseMatch[1]!;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      const match = line.match(springPattern);
      if (match) {
        const annotation = match[1]!;
        const routePath = basePath + match[2]!;
        const methodMap: Record<string, string> = {
          GetMapping: 'GET',
          PostMapping: 'POST',
          PutMapping: 'PUT',
          PatchMapping: 'PATCH',
          DeleteMapping: 'DELETE',
          RequestMapping: 'ANY',
        };
        const method = methodMap[annotation] ?? 'ANY';
        const patternKey = `${method} ${routePath}`;

        records.push({
          id: `extracted:api-paths:${hash(filePath + ':' + patternKey)}`,
          extractor: 'api-paths',
          language,
          filePath,
          line: i + 1,
          nodeType: 'business_process',
          name: patternKey,
          content: `${method} ${routePath}`,
          confidence: 0.9,
          metadata: { method, path: routePath, framework: 'spring' },
        });
      }
    }

    return records;
  }
}
