# Harness Test Data

> Test factories, fixtures, database seeding, and test data isolation. Establishes patterns for creating realistic, composable test data without coupling tests to specific database states.

## When to Use

- Setting up test data factories for a new domain model or entity
- Migrating from shared test fixtures to isolated factory-based test data
- Establishing database seeding for development, staging, or test environments
- NOT when writing the tests themselves (use harness-tdd or harness-e2e instead)
- NOT when designing the database schema (use harness-database instead)
- NOT when testing data pipeline transformations (use harness-data-validation instead)

## Process

### Phase 1: DETECT -- Identify Models and Existing Patterns

1. **Catalog domain models.** Scan for:
   - ORM model definitions (Prisma schema, TypeORM entities, Django models, SQLAlchemy models)
   - Database migration files that reveal table structures and relationships
   - TypeScript/Python type definitions for domain objects

2. **Map model relationships.** For each model, identify:
   - Required fields and their types
   - Foreign key relationships and cardinality (one-to-one, one-to-many, many-to-many)
   - Unique constraints, enums, and validation rules
   - Default values and auto-generated fields (IDs, timestamps)

3. **Inventory existing test data patterns.** Search for:
   - Factory files (fishery, factory-bot, factory_boy, rosie)
   - Fixture files (JSON, YAML, SQL seed files)
   - Inline test data (objects constructed directly in test files)
   - Shared test setup files (beforeAll/beforeEach with data creation)

4. **Identify test data problems.** Flag:
   - Tests that share mutable data (one test's setup affects another)
   - Hardcoded IDs or magic values that break when database is reset
   - Missing cleanup leading to test pollution
   - Overly complex setup that obscures test intent

5. **Report findings.** Summarize: models found, existing patterns, and specific problems to address.

### Phase 2: DESIGN -- Choose Patterns and Plan Structure

1. **Select the factory pattern.** Based on the project's language and conventions:
   - **TypeScript/JavaScript:** fishery (type-safe factories with traits), or a custom builder pattern
   - **Python:** factory_boy (Django/SQLAlchemy integration), or Faker-based builders
   - **Go:** custom builder functions with functional options pattern
   - **Ruby:** factory_bot with traits and transient attributes

2. **Design the factory API.** Each factory must support:
   - Default creation: `UserFactory.build()` returns a valid object with sensible defaults
   - Override: `UserFactory.build({ name: 'Custom' })` overrides specific fields
   - Traits: `UserFactory.build({ trait: 'admin' })` applies a named set of overrides
   - Associations: `ProjectFactory.build()` automatically creates a related `User` owner
   - Batch creation: `UserFactory.buildList(5)` returns an array

3. **Plan data relationships.** Define how factories handle foreign keys:
   - Lazy association: create the related record only when needed
   - Explicit association: pass an existing related record to avoid duplicates
   - Transient attributes: factory parameters that control behavior but are not persisted

4. **Design cleanup strategy.** Choose based on test infrastructure:
   - **Transaction rollback:** wrap each test in a transaction (fastest, requires framework support)
   - **Truncation:** truncate tables between tests in dependency order
   - **Deletion:** delete records created by the test using tracked IDs
   - **Database recreation:** drop and recreate the test database per suite (slowest, most isolated)

5. **Define seed data tiers.** Separate:
   - Reference data: enums, categories, roles -- loaded once, read-only
   - Scenario data: realistic datasets for development and demos
   - Test data: minimal data created per-test via factories

### Phase 3: SCAFFOLD -- Generate Factories and Seed Scripts

1. **Create the factory directory structure.** Follow the project's conventions:
   - `tests/factories/` or `src/__tests__/factories/` for unit/integration test factories
   - `seeds/` or `prisma/seed.ts` for database seeding scripts
   - `tests/fixtures/` for static fixture data (JSON, YAML)

2. **Generate a factory for each domain model.** Each factory file contains:
   - Default attribute definitions using realistic fake data (Faker for names, emails, dates)
   - Traits for common variations (active/inactive, admin/member, draft/published)
   - Association handling for required relationships
   - Type safety: factory output matches the model type definition

3. **Generate a factory index.** Create a barrel file that exports all factories for easy importing:

   ```
   import { UserFactory, ProjectFactory, TaskFactory } from '../factories';
   ```

4. **Create seed scripts.** Generate:
   - Reference data seeder: loads enums, categories, and lookup tables
   - Development seeder: creates a realistic dataset for local development
   - Test seeder: minimal baseline data required by most tests

5. **Create cleanup utilities.** Generate:
   - Database cleanup function that truncates or deletes in correct dependency order
   - Test lifecycle hooks (beforeEach/afterEach) that integrate cleanup
   - Transaction wrapper for test isolation (if supported by the ORM)

6. **Verify factories produce valid data.** Write a smoke test that builds one instance of every factory and validates it against the model schema.

### Phase 4: VALIDATE -- Verify Isolation, Composability, and Correctness

1. **Test factory defaults.** For each factory, verify:
   - `build()` returns a valid object that passes model validation
   - Required fields are populated with realistic values
   - Unique fields generate unique values across multiple builds
   - Associations are created when needed and reused when provided

2. **Test factory composition.** Verify:
   - Traits compose correctly: `UserFactory.build({ traits: ['admin', 'verified'] })` applies both
   - Overrides take precedence over defaults and traits
   - Batch creation produces distinct records with unique identifiers

3. **Test data isolation.** Run the test suite with factory-generated data and verify:
   - Tests pass in any execution order (run with randomized order flag)
   - No test reads data created by another test
   - Cleanup runs correctly between tests (no orphaned records)

4. **Test seed scripts.** Verify:
   - Seed scripts are idempotent (running twice does not create duplicates)
   - Reference data seeder can run against an empty database
   - Development seeder creates a realistic, navigable dataset

5. **Run `harness validate`.** Confirm the project passes all harness checks with factory infrastructure in place.

### Graph Refresh

If a knowledge graph exists at `.harness/graph/`, refresh it after code changes to keep graph queries accurate:

```
harness scan [path]
```

## Harness Integration

- **`harness validate`** -- Run in VALIDATE phase after all factories and seed scripts are created. Confirms project health.
- **`harness check-deps`** -- Run after SCAFFOLD phase to ensure test factory dependencies (Faker, fishery) are in devDependencies, not dependencies.
- **`emit_interaction`** -- Used at design checkpoints to present factory pattern options and cleanup strategy choices to the human.
- **Grep** -- Used in DETECT phase to find inline test data, hardcoded IDs, and existing factory patterns.
- **Glob** -- Used to catalog model definitions, migration files, and existing fixture files.

## Success Criteria

- Every domain model has a corresponding factory with sensible defaults
- Factories produce valid objects that pass model validation without any overrides
- No test file contains inline object construction for domain models (all use factories)
- Tests pass in any execution order, confirming data isolation
- Seed scripts are idempotent and documented
- Cleanup runs between tests with no orphaned records
- `harness validate` passes with factory infrastructure in place

## Examples

### Example: Fishery Factories for a TypeScript Project

**SCAFFOLD -- User factory with traits:**

```typescript
// tests/factories/user.factory.ts
import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';
import { User } from '../../src/types/user';

export const UserFactory = Factory.define<User>(({ sequence, params, transientParams }) => ({
  id: `user-${sequence}`,
  email: params.email ?? faker.internet.email(),
  name: params.name ?? faker.person.fullName(),
  role: params.role ?? 'member',
  status: params.status ?? 'active',
  createdAt: params.createdAt ?? faker.date.past(),
  updatedAt: new Date(),
}));

// Traits
export const AdminUser = UserFactory.params({ role: 'admin' });
export const InactiveUser = UserFactory.params({ status: 'inactive' });
```

**SCAFFOLD -- Project factory with association:**

```typescript
// tests/factories/project.factory.ts
import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';
import { Project } from '../../src/types/project';
import { UserFactory } from './user.factory';

export const ProjectFactory = Factory.define<Project>(({ sequence, associations }) => ({
  id: `project-${sequence}`,
  name: faker.commerce.productName(),
  description: faker.lorem.sentence(),
  owner: associations.owner ?? UserFactory.build(),
  ownerId: associations.owner?.id ?? `user-${sequence}`,
  status: 'active',
  createdAt: faker.date.past(),
}));
```

### Example: factory_boy for a Django Project

**SCAFFOLD -- Django model factories:**

```python
# tests/factories.py
import factory
from factory.django import DjangoModelFactory
from faker import Faker
from myapp.models import User, Organization, Project

fake = Faker()

class OrganizationFactory(DjangoModelFactory):
    class Meta:
        model = Organization

    name = factory.LazyFunction(lambda: fake.company())
    slug = factory.LazyAttribute(lambda o: o.name.lower().replace(' ', '-'))

class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.LazyFunction(lambda: fake.unique.email())
    name = factory.LazyFunction(lambda: fake.name())
    organization = factory.SubFactory(OrganizationFactory)

    class Params:
        admin = factory.Trait(is_staff=True, is_superuser=True)

class ProjectFactory(DjangoModelFactory):
    class Meta:
        model = Project

    name = factory.LazyFunction(lambda: fake.catch_phrase())
    owner = factory.SubFactory(UserFactory)
    organization = factory.LazyAttribute(lambda p: p.owner.organization)
```

**Usage in tests:**

```python
def test_project_belongs_to_owner_organization():
    project = ProjectFactory.create()
    assert project.organization == project.owner.organization

def test_admin_can_delete_any_project():
    admin = UserFactory.create(admin=True)
    project = ProjectFactory.create()
    assert admin.has_perm('delete_project', project)
```

## Rationalizations to Reject

| Rationalization                                                                                                    | Reality                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The test only needs one user — I'll just hardcode `userId: 1` rather than building a factory."                    | Hardcoded IDs cause silent test failures when the database is reset, when tests run in parallel, or when another test creates a conflicting record. Factories with sequences or UUIDs exist precisely to avoid this class of failure. One hardcoded ID is how fragile test suites start.                            |
| "The factory produces objects that are close enough to valid — the test just needs to override two fields anyway." | A factory that requires overrides to produce a valid object has wrong defaults. The factory's zero-override output must pass model validation. If it does not, the factory is documenting the wrong defaults and tests that rely on overrides will break when the model changes.                                    |
| "Cleanup is handled by rolling back the test transaction — I don't need explicit teardown."                        | Transaction rollback works until it does not: tests that span multiple connections, tests that call external APIs, or tests that write to a queue or file system all escape the transaction. Explicit cleanup is the only strategy that covers all cases, including tests that use features you have not built yet. |
| "We can share the same seeded dataset across all integration tests to avoid the overhead of per-test factories."   | Shared mutable data means test A's side effect becomes test B's precondition. When tests fail intermittently based on execution order, the root cause is always shared state. The overhead of per-test factory creation is small compared to the cost of debugging order-dependent failures.                        |
| "The model only has three fields — writing a factory is more overhead than just constructing the object inline."   | Today's three-field model becomes tomorrow's ten-field model with required foreign keys. Inline construction scales linearly with model complexity. A factory written once absorbs all future field additions in one place. The overhead argument inverts as the codebase grows.                                    |

## Gates

- **No hardcoded IDs in factories.** Factories must generate unique IDs per instance. Hardcoded IDs cause collision failures when tests run in parallel. Use sequences or UUIDs.
- **No production data in test fixtures.** Test data must be synthetic. If a fixture file contains real customer names, emails, or PII, it must be replaced with Faker-generated data before merging.
- **Factories must produce valid objects.** A factory `build()` with zero overrides must return an object that passes model validation. If it requires manual overrides to be valid, the defaults are wrong.
- **Cleanup must be explicit.** Do not rely on test framework teardown happening "eventually." Every test or test suite that creates database records must have an explicit cleanup step that runs even when tests fail.

## Escalation

- **When models have circular dependencies (User has Projects, Project has Owner User):** Use lazy evaluation or two-pass creation. Create the User first without Projects, create the Project with the User, then optionally update the User. Document the pattern in the factory file.
- **When the database schema is too complex for factories (50+ models):** Prioritize factories for the models that appear most frequently in tests. Use a tiered approach: core factories first, then add factories for secondary models as tests demand them.
- **When seed data conflicts with migration state:** Seed scripts must be updated whenever migrations change the schema. If seeds fail after a migration, fix the seeds immediately -- do not skip seeding.
- **When test isolation requires database-level features (row-level security, multi-tenancy):** Factory cleanup may need tenant-aware truncation. Escalate to ensure the cleanup strategy respects the application's multi-tenancy model.
