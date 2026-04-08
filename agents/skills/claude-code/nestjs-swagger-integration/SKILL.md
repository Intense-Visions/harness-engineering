# NestJS Swagger Integration

> Document APIs with @ApiProperty, @ApiOperation, @ApiTags, and DocumentBuilder

## When to Use

- You need interactive API documentation served at `/api` (or a custom path)
- You need to document request/response schemas for frontend developers or API consumers
- You want to generate an OpenAPI spec that can be imported into Postman, Insomnia, or API gateways
- You are documenting authentication requirements (Bearer token, API key) on your endpoints

## Instructions

1. **Install and bootstrap:**

```bash
npm install @nestjs/swagger swagger-ui-express
```

```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('My API')
  .setDescription('REST API documentation')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api', app, document, {
  swaggerOptions: { persistAuthorization: true },
});
```

2. **Annotate controllers:**

```typescript
@ApiTags('users')
@Controller('users')
export class UsersController {
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: UserDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Get(':id')
  findOne(@Param('id') id: string) { ... }

  @ApiOperation({ summary: 'Create a user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, type: UserDto })
  @ApiBearerAuth()
  @Post()
  create(@Body() dto: CreateUserDto) { ... }
}
```

3. **Annotate DTOs:**

```typescript
export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'myP@ssw0rd', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  displayName?: string;
}
```

4. **Use mapped types from `@nestjs/swagger`** (not `@nestjs/mapped-types`) for full Swagger compatibility:

```typescript
import { PartialType, OmitType, PickType } from '@nestjs/swagger';
export class UpdateUserDto extends PartialType(CreateUserDto) {}
export class UserProfileDto extends OmitType(CreateUserDto, ['password']) {}
```

5. **Document pagination responses:**

```typescript
@ApiResponse({ status: 200, schema: {
  properties: {
    data: { type: 'array', items: { $ref: getSchemaPath(UserDto) } },
    total: { type: 'number' },
    page: { type: 'number' },
  }
}})
```

## Details

`@nestjs/swagger` uses TypeScript reflection metadata to auto-detect types in DTOs and controllers. When `emitDecoratorMetadata` is enabled in `tsconfig.json` (it must be for NestJS to work), most types are inferred automatically.

**Enum documentation:** Pass `enum: MyEnum` in `@ApiProperty` for Swagger to show all valid values: `@ApiProperty({ enum: UserRole, enumName: 'UserRole' })`.

**`@ApiHideProperty()`:** Exclude a property from the Swagger spec (e.g., internal tracking fields) without removing it from the DTO class.

**CLI plugin (recommended):** Add to `nest-cli.json` to auto-add `@ApiProperty` based on class-validator decorators — eliminates duplication:

```json
{
  "compilerOptions": {
    "plugins": ["@nestjs/swagger"]
  }
}
```

**Exclude from production:** The Swagger UI and spec endpoint should be conditionally registered. Wrap the `SwaggerModule.setup()` call: `if (process.env.NODE_ENV !== 'production') { ... }`.

**Export the spec:** `SwaggerModule.createDocument()` returns a plain OpenAPI 3.0 object. Write it to disk with `fs.writeFileSync('swagger.json', JSON.stringify(document))` to integrate with API gateway import workflows.

## Source

https://docs.nestjs.com/openapi/introduction
