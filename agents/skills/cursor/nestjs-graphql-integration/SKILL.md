# NestJS GraphQL Integration

> Build GraphQL APIs with GraphQLModule, @Resolver, @Query/@Mutation, @ObjectType, and DataLoader

## When to Use

- You are building an API that needs flexible field selection to avoid over/under-fetching
- You have a complex domain with many interrelated entities and nested queries
- Your frontend needs real-time subscriptions alongside standard queries
- You want a strongly-typed schema generated from TypeScript classes (code-first approach)

## Instructions

1. **Install and configure:**

```bash
npm install @nestjs/graphql @nestjs/apollo @apollo/server graphql
```

```typescript
@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
    }),
  ],
})
export class AppModule {}
```

2. **Define object types:**

```typescript
@ObjectType()
export class User {
  @Field(() => ID) id: string;
  @Field() email: string;
  @Field({ nullable: true }) displayName?: string;
  @Field(() => [Post]) posts: Post[];
}
```

3. **Create a resolver:**

```typescript
@Resolver(() => User)
export class UsersResolver {
  constructor(
    private usersService: UsersService,
    private postsService: PostsService
  ) {}

  @Query(() => User, { nullable: true })
  user(@Args('id', { type: () => ID }) id: string): Promise<User | null> {
    return this.usersService.findOne(id);
  }

  @Query(() => [User])
  users(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Mutation(() => User)
  createUser(@Args('input') input: CreateUserInput): Promise<User> {
    return this.usersService.create(input);
  }

  @ResolveField(() => [Post])
  posts(@Parent() user: User): Promise<Post[]> {
    return this.postsService.findByUser(user.id);
  }
}
```

4. **Input types for mutations:**

```typescript
@InputType()
export class CreateUserInput {
  @Field() @IsEmail() email: string;
  @Field() @MinLength(8) password: string;
}
```

5. **DataLoader for N+1 prevention:**

```typescript
@Injectable({ scope: Scope.REQUEST })
export class PostsLoader {
  constructor(private postsService: PostsService) {}

  readonly loader = new DataLoader<string, Post[]>(async (userIds) => {
    const posts = await this.postsService.findByUserIds([...userIds]);
    return userIds.map((id) => posts.filter((p) => p.userId === id));
  });
}
```

## Details

**Code-first vs schema-first:** Code-first (above) generates the SDL from TypeScript decorators. Schema-first starts from a `.graphql` file and maps resolvers to it. Code-first is preferred for TypeScript teams because types are unified.

**`@Field(() => Type)` explicit types:** When TypeScript reflection cannot determine the type (arrays, enums, circular references), the explicit arrow function syntax is required. For nullable fields: `@Field({ nullable: true })`.

**Auth on resolvers:** Apply guards with `@UseGuards(JwtAuthGuard)` on the class or individual query/mutation. Access the current user via `@Context() ctx: GqlContext` where `ctx.req.user` is populated by the guard.

**Subscriptions:** Add `installSubscriptionHandlers: true` and use `@Subscription(() => Post)` with `pubSub.asyncIterator('postCreated')` for real-time updates via WebSocket.

**Complexity and depth limiting:** In production, configure `validationRules: [depthLimit(5), createComplexityRule(...)]` to prevent expensive queries from exhausting server resources.

## Source

https://docs.nestjs.com/graphql/quick-start
