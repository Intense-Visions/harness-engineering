# NestJS Controller Pattern

> Define HTTP route handlers with @Controller, method decorators, params, and versioning

## When to Use

- You are creating a new REST endpoint or modifying an existing route
- You need to extract path params, query strings, or request body from incoming requests
- You want to add API versioning to your routes
- You need to bypass NestJS response handling and write directly to the underlying response object

## Instructions

1. Decorate the class with `@Controller('resource')` to set the route prefix. Use kebab-case for multi-word resources (`@Controller('user-profiles')`).
2. Use method decorators `@Get()`, `@Post()`, `@Put()`, `@Patch()`, `@Delete()` to bind HTTP methods. Nest the path in the decorator when appropriate: `@Get(':id')`.
3. Extract route data with parameter decorators:
   - `@Param('id')` — path parameter
   - `@Query('page')` — query string parameter
   - `@Body()` — full request body (use a DTO class for type safety)
   - `@Headers('authorization')` — request header
   - `@Req()` / `@Res()` — raw Express/Fastify request/response (avoid unless necessary)
4. Return values from handlers are automatically serialized to JSON. Do NOT inject `@Res()` unless you need to stream or set custom headers — doing so bypasses NestJS interceptors and exception filters.
5. Apply `@HttpCode(201)` to `@Post()` handlers that create resources (default is 200).
6. Use `@Header('Cache-Control', 'no-cache')` for static header overrides.

```typescript
@Controller({ path: 'articles', version: '1' })
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.articlesService.findAll({ page, limit });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService.findOne(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() createArticleDto: CreateArticleDto) {
    return this.articlesService.create(createArticleDto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateArticleDto) {
    return this.articlesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService.remove(id);
  }
}
```

7. Enable versioning app-wide in `main.ts`: `app.enableVersioning({ type: VersioningType.URI })`. Then use `@Controller({ version: '1' })` or `@Version('2')` on individual handlers.
8. Keep controllers thin — they orchestrate, they do not contain business logic. All logic lives in the service layer.

## Details

Controllers are the entry point for HTTP requests in NestJS. They are registered in the `controllers` array of their parent module and are not injectable themselves.

**Route ordering:** NestJS registers routes in declaration order. Static routes (`/articles/trending`) must be declared before dynamic routes (`/articles/:id`) within the same controller to avoid shadowing.

**@Res() caution:** When you inject `@Res()`, NestJS hands off response management entirely to you. Interceptors (including serialization and transformation interceptors) will NOT run. If you only need to set headers or status codes, use `@HttpCode()` and `@Header()` decorators instead. If you must use `@Res()`, pass `{ passthrough: true }` to keep NestJS in control: `@Res({ passthrough: true })`.

**Pipe integration:** Built-in pipes like `ParseIntPipe`, `ParseUUIDPipe`, `ParseBoolPipe` can be passed directly in the parameter decorator: `@Param('id', ParseUUIDPipe) id: string`. The pipe validates and transforms before the handler executes.

**Versioning strategies:** URI (`/v1/articles`), Header (`X-API-Version: 1`), Media Type (`Accept: application/vnd.api+json;v=1`), and Custom are all supported. URI versioning is the most visible and cacheable.

## Source

https://docs.nestjs.com/controllers
