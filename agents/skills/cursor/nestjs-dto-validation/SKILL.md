# NestJS DTO Validation

> Validate request payloads with class-validator, class-transformer, and DTO patterns

## When to Use

- You need to validate the shape and content of request bodies, query parameters, or path parameters
- You want automatic stripping of unexpected properties from incoming requests
- You need to document the API payload shape for Swagger/OpenAPI
- You need nested object validation (e.g., an order with nested line items)

## Instructions

1. **Install dependencies:**

```bash
npm install class-validator class-transformer
```

2. **Create a DTO class** with validation decorators:

```typescript
import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  ValidateNested,
  Type,
} from 'class-validator';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsEnum(UserRole)
  role: UserRole = UserRole.USER;
}
```

3. **Nested DTO validation** — requires `@ValidateNested()` + `@Type()`:

```typescript
export class AddressDto {
  @IsString() street: string;
  @IsString() city: string;
  @IsPostalCode('US') zip: string;
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress: AddressDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  items: LineItemDto[];
}
```

4. **Update DTOs** — use `PartialType` from `@nestjs/mapped-types`:

```typescript
import { PartialType } from '@nestjs/mapped-types';
export class UpdateUserDto extends PartialType(CreateUserDto) {}
```

5. **Swagger + validation together** — use `@ApiProperty` alongside validators:

```typescript
@ApiProperty({ example: 'user@example.com' })
@IsEmail()
email: string;
```

Or use `@nestjs/swagger`'s `@ApiProperty` auto-generation via `PickType`, `OmitType`, `IntersectionType`.

6. Enable `ValidationPipe` globally with `whitelist: true` and `transform: true` (see nestjs-pipes-pattern).

## Details

DTOs (Data Transfer Objects) define the shape of data flowing into your API. They serve three purposes simultaneously: validation, transformation, and documentation.

**Common class-validator decorators:**

- `@IsString()`, `@IsNumber()`, `@IsBoolean()`, `@IsDate()`
- `@IsEmail()`, `@IsUrl()`, `@IsUUID()`, `@IsPostalCode()`
- `@IsEnum(MyEnum)`, `@IsIn(['a', 'b', 'c'])`
- `@Min(n)`, `@Max(n)`, `@MinLength(n)`, `@MaxLength(n)`
- `@IsArray()`, `@ArrayMinSize(n)`, `@ArrayMaxSize(n)`
- `@IsOptional()` — skips validation if the field is absent or undefined
- `@IsDefined()` — fails if the field is undefined (stricter than `@IsNotEmpty()`)

**`whitelist: true` and `forbidNonWhitelisted: true`:** With whitelist enabled, any property without a decorator is silently removed. With `forbidNonWhitelisted`, a 400 is thrown instead. Both protect against mass-assignment vulnerabilities.

**`@Expose()` and `@Exclude()` (class-transformer):** When using `ClassSerializerInterceptor`, decorate response entity fields with `@Exclude()` to hide sensitive data (passwords, internal IDs). The `@Expose()` decorator marks which fields to include when `excludeExtraneousValues: true` is set.

**Validation groups:** `class-validator` supports groups for conditional validation. Rarely needed — prefer creating separate DTOs (`CreateUserDto` vs `UpdateUserDto`) over validation groups.

## Source

https://docs.nestjs.com/techniques/validation
