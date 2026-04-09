# NestJS Pipes Pattern

> Validate and transform request data with PipeTransform, ValidationPipe, and custom pipes

## When to Use

- You need to validate incoming request bodies against a DTO class
- You need to transform a string route parameter to a number, UUID, boolean, or enum
- You want validation to run automatically on all routes without per-handler boilerplate
- You are building a custom transformation (e.g., trim strings, normalize phone numbers)

## Instructions

1. **Enable ValidationPipe globally** in `main.ts` (recommended for most applications):

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // strip properties not in DTO
    forbidNonWhitelisted: true, // throw on extra properties
    transform: true, // auto-transform payload to DTO class instance
    transformOptions: { enableImplicitConversion: true },
  })
);
```

2. **Use built-in transformation pipes** as inline pipe arguments:

```typescript
@Get(':id')
findOne(@Param('id', ParseUUIDPipe) id: string) { ... }

@Get(':page')
list(@Query('page', ParseIntPipe) page: number) { ... }

@Param('status', new ParseEnumPipe(UserStatus)) status: UserStatus
```

3. **Define DTO classes with class-validator decorators:**

```typescript
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}
```

4. **Custom pipe** — implement `PipeTransform<T, R>`:

```typescript
@Injectable()
export class TrimPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string') return value;
    return value.trim();
  }
}
```

5. Apply custom pipes at the parameter level: `@Body('name', TrimPipe) name: string`.

6. For pipes that may fail (e.g., parsing), throw `BadRequestException` rather than returning null.

## Details

Pipes serve two roles: **validation** (throw if invalid) and **transformation** (convert to the expected type). Both happen before the handler executes.

**`whitelist: true` behavior:** `ValidationPipe` strips any property on the incoming JSON that has no corresponding decorator in the DTO. This prevents mass-assignment attacks where clients send unexpected fields (e.g., `isAdmin: true`). `forbidNonWhitelisted: true` goes further and throws a 400 if any extra property is present.

**`transform: true`:** Without this, `@Body() dto: CreateUserDto` gives you a plain object, not a `CreateUserDto` instance. With it, NestJS runs `class-transformer`'s `plainToInstance` automatically so you get a proper class instance and `@Type()` decorators work correctly.

**Class-validator integration:** All `class-validator` decorators (`@IsEmail()`, `@IsUUID()`, `@IsEnum()`, `@Min()`, `@Max()`, etc.) work with `ValidationPipe`. Nested DTOs require `@ValidateNested()` combined with `@Type(() => NestedDto)`.

**Scope:** Pipes can be applied at four levels (most specific wins):

1. Global — `app.useGlobalPipes()`
2. Controller — `@UsePipes()`
3. Method — `@UsePipes()`
4. Parameter — inline in `@Param('id', ParseUUIDPipe)`

**Async pipes:** `transform()` can return `Promise<R>`. This enables async validation (e.g., checking a database for uniqueness), though this is better done at the service layer.

## Source

https://docs.nestjs.com/pipes

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
