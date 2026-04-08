# Zod Array Validation

> Validate arrays, tuples, records, maps, and sets with Zod's collection primitives

## When to Use

- Validating lists of items with consistent shape (e.g., API response arrays, batch inputs)
- Validating key-value maps where keys and values have known types
- Working with fixed-length, typed positional data using tuples
- Ensuring collections meet cardinality constraints (non-empty, length limits)

## Instructions

1. Use `z.array()` for lists of items with a uniform element schema:

```typescript
import { z } from 'zod';

const TagsSchema = z.array(z.string());
const NumberListSchema = z.array(z.number().positive());
const UserListSchema = z.array(UserSchema);
```

2. Constrain array length with `.min()`, `.max()`, and `.length()`:

```typescript
const AtLeastOneSchema = z.array(z.string()).min(1, 'At least one item required');
const BoundedSchema = z.array(z.number()).min(1).max(10);
const ExactSizeSchema = z.array(z.string()).length(3, 'Must have exactly 3 items');
```

3. Use `.nonempty()` as a type-aware alternative to `.min(1)` — the inferred type becomes a non-empty tuple:

```typescript
const NonEmptyTags = z.array(z.string()).nonempty('At least one tag is required');
type NonEmptyTags = z.infer<typeof NonEmptyTags>; // [string, ...string[]]
```

4. Use `z.tuple()` for fixed-length arrays with positional types:

```typescript
const PointSchema = z.tuple([z.number(), z.number()]);
// [x, y] — exactly two numbers

const RGBSchema = z.tuple([
  z.number().min(0).max(255),
  z.number().min(0).max(255),
  z.number().min(0).max(255),
]);

// Tuple with rest element (fixed prefix + variable suffix)
const AtLeastTwoStrings = z.tuple([z.string(), z.string()]).rest(z.string());
```

5. Use `z.record()` for key-value maps where keys are strings and values share a type:

```typescript
// Record with string keys and number values
const ScoreMapSchema = z.record(z.number());
// Equivalent to { [key: string]: number }

// Record with validated string keys
const EnvVarsSchema = z.record(z.string().min(1));

// Record with typed keys (uses z.enum or z.string())
const FeatFlagsSchema = z.record(z.enum(['featureA', 'featureB', 'featureC']), z.boolean());
```

6. Use `z.map()` for JavaScript `Map` objects:

```typescript
const StringToNumberMap = z.map(z.string(), z.number());
// Parses: new Map([['a', 1], ['b', 2]])
```

7. Use `z.set()` for JavaScript `Set` objects:

```typescript
const UniqueTagsSchema = z.set(z.string());
const BoundedSetSchema = z.set(z.number()).min(1).max(5);
// Parses: new Set([1, 2, 3])
```

8. Use `.element` to access the element schema of an array for composition:

```typescript
const ItemsSchema = z.array(z.object({ id: z.string(), name: z.string() }));
const ItemSchema = ItemsSchema.element; // z.ZodObject<...>
type Item = z.infer<typeof ItemSchema>;
```

## Details

**Array vs tuple — when to choose:**

| Scenario                           | Use                   |
| ---------------------------------- | --------------------- |
| Variable-length, homogeneous items | `z.array()`           |
| Fixed-length, positional items     | `z.tuple()`           |
| Key-value pairs with string keys   | `z.record()`          |
| JS Map/Set preservation            | `z.map()` / `z.set()` |

**Unique element validation:**

Zod does not have built-in uniqueness checking. Use `.refine()`:

```typescript
const UniqueStringsSchema = z.array(z.string()).refine((arr) => new Set(arr).size === arr.length, {
  message: 'Array must contain unique values',
});
```

**Transforming arrays:**

```typescript
// Sort after parsing
const SortedNumbersSchema = z.array(z.number()).transform((arr) => [...arr].sort((a, b) => a - b));

// Deduplicate
const DeduplicatedSchema = z.array(z.string()).transform((arr) => [...new Set(arr)]);

// Flatten
const FlatTagsSchema = z.array(z.array(z.string())).transform((arr) => arr.flat());
```

**Paginated response pattern:**

```typescript
function paginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}

const PaginatedUsersSchema = paginatedSchema(UserSchema);
type PaginatedUsers = z.infer<typeof PaginatedUsersSchema>;
```

## Source

https://zod.dev/api#arrays
