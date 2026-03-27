const FRAMEWORK_SECTIONS: Record<string, { title: string; content: string }> = {
  nextjs: {
    title: 'Next.js Conventions',
    content: [
      '- Use the App Router (`src/app/`) for all routes',
      '- Server Components by default; add `"use client"` only when needed',
      '- Use `next/image` for images and `next/link` for navigation',
      '- API routes go in `src/app/api/`',
      '- Run `next dev` for development, `next build` for production',
    ].join('\n'),
  },
  'react-vite': {
    title: 'React + Vite Conventions',
    content: [
      '- Component files use `.tsx` extension in `src/`',
      '- Use Vite for dev server and bundling (`npm run dev`)',
      '- Prefer function components with hooks',
      '- CSS modules or styled-components for styling',
      '- Tests use Vitest (`npm test`)',
    ].join('\n'),
  },
  vue: {
    title: 'Vue Conventions',
    content: [
      '- Single File Components (`.vue`) in `src/`',
      '- Use `<script setup>` with Composition API',
      '- Vite for dev server and bundling (`npm run dev`)',
      '- Vue Router for routing, Pinia for state management',
      '- Tests use Vitest (`npm test`)',
    ].join('\n'),
  },
  express: {
    title: 'Express Conventions',
    content: [
      '- Entry point at `src/app.ts`',
      '- Routes in `src/routes/`, middleware in `src/middleware/`',
      '- Use `express.json()` for body parsing',
      '- Error handling via centralized error middleware',
      '- Tests use Vitest with supertest (`npm test`)',
    ].join('\n'),
  },
  nestjs: {
    title: 'NestJS Conventions',
    content: [
      '- Module-based architecture: each feature in its own module',
      '- Use decorators (`@Controller`, `@Injectable`, `@Module`)',
      '- Entry point at `src/main.ts`, root module at `src/app.module.ts`',
      '- Use Nest CLI for generating components (`nest g`)',
      '- Tests use Vitest (`npm test`)',
    ].join('\n'),
  },
  fastapi: {
    title: 'FastAPI Conventions',
    content: [
      '- Entry point at `src/main.py` with FastAPI app instance',
      '- Use Pydantic models for request/response validation',
      '- Async endpoints preferred; sync is acceptable for CPU-bound work',
      '- Run with `uvicorn src.main:app --reload` for development',
      '- Tests use pytest (`pytest`)',
    ].join('\n'),
  },
  django: {
    title: 'Django Conventions',
    content: [
      '- Settings at `src/settings.py`, URLs at `src/urls.py`',
      '- Use `manage.py` for management commands',
      '- Apps in `src/` directory; each app has models, views, urls',
      '- Run with `python manage.py runserver` for development',
      '- Tests use pytest with pytest-django (`pytest`)',
    ].join('\n'),
  },
  gin: {
    title: 'Gin Conventions',
    content: [
      '- Entry point at `main.go` with Gin router setup',
      '- Group routes by feature using `router.Group()`',
      '- Use middleware for logging, auth, error recovery',
      '- Run with `go run main.go` for development',
      '- Tests use `go test ./...`',
    ].join('\n'),
  },
  axum: {
    title: 'Axum Conventions',
    content: [
      '- Entry point at `src/main.rs` with Axum router',
      '- Use extractors for request parsing (`Path`, `Query`, `Json`)',
      '- Shared state via `Extension` or `State`',
      '- Run with `cargo run` for development',
      '- Tests use `cargo test`',
    ].join('\n'),
  },
  'spring-boot': {
    title: 'Spring Boot Conventions',
    content: [
      '- Entry point annotated with `@SpringBootApplication`',
      '- Controllers in `controller/` package, services in `service/`',
      '- Use constructor injection for dependencies',
      '- Run with `mvn spring-boot:run` for development',
      '- Tests use JUnit 5 with Spring Boot Test (`mvn test`)',
    ].join('\n'),
  },
};

export function buildFrameworkSection(framework: string): string {
  const entry = FRAMEWORK_SECTIONS[framework];
  if (!entry) return '';
  return `## ${entry.title}\n\n<!-- framework: ${framework} -->\n${entry.content}\n`;
}

export function appendFrameworkSection(
  existingContent: string,
  framework: string | undefined,
  _language: string | undefined
): string {
  if (!framework) return existingContent;

  const startMarker = `<!-- harness:framework-conventions:${framework} -->`;
  const endMarker = `<!-- /harness:framework-conventions:${framework} -->`;

  // Guard: do not duplicate
  if (existingContent.includes(startMarker)) return existingContent;

  const section = buildFrameworkSection(framework);
  if (!section) return existingContent;

  const block = `\n${startMarker}\n${section}${endMarker}\n`;
  return existingContent.trimEnd() + '\n' + block;
}
