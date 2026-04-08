# NestJS Guards Pattern

> Protect routes with @UseGuards, CanActivate, JWT guards, and role-based access control

## When to Use

- You need to verify authentication before a handler executes (JWT, API key, session)
- You need role-based or permission-based access control on specific routes
- You want to centralize authentication logic instead of repeating it in every controller method
- You need to read the current user from the token and attach it to the request

## Instructions

1. Implement `CanActivate` and return `true` (allow) or `false`/throw (deny):

```typescript
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException();
    try {
      request['user'] = this.jwtService.verify(token, { secret: process.env.JWT_SECRET });
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private extractToken(req: Request): string | undefined {
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

2. Apply guards with `@UseGuards(GuardClass)` at the controller or handler level. Handler-level overrides controller-level.
3. Apply globally in `main.ts` for app-wide auth: `app.useGlobalGuards(new JwtAuthGuard(jwtService))`. For DI in global guards, use `APP_GUARD` provider instead:

```typescript
providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }];
```

4. Use `Reflector` and custom decorators to build a roles guard:

```typescript
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // no roles required
    const { user } = context.switchToHttp().getRequest();
    return required.some((role) => user?.roles?.includes(role));
  }
}
```

5. Use `@Public()` with a `SetMetadata('isPublic', true)` decorator to bypass global auth guards on specific routes.
6. `ExecutionContext` is transport-agnostic — use `context.switchToWs()` for WebSockets and `context.switchToRpc()` for microservices.

## Details

Guards run after middleware but before interceptors and pipes in the NestJS request lifecycle. They are the correct place for authorization decisions because they have access to `ExecutionContext`, which provides the handler and class metadata.

**Guard vs Middleware:** Middleware runs before routing and has no knowledge of which handler will process the request. Guards run after routing with full handler context, making them the right tool for authorization logic that depends on route metadata (roles, permissions).

**Throwing vs returning false:** Throwing `UnauthorizedException` (or any `HttpException`) is preferred over returning `false`. Returning `false` causes NestJS to throw a generic `ForbiddenException` (403), which may not communicate the correct HTTP status.

**Multiple guards:** `@UseGuards(AuthGuard, RolesGuard)` applies guards in order. If `AuthGuard` throws, `RolesGuard` never runs. Compose authentication and authorization as separate guards for clean separation of concerns.

**Passport integration:** `@nestjs/passport` provides `AuthGuard('jwt')`, `AuthGuard('local')`, etc. that wrap Passport strategies. Use it when you need OAuth2, SAML, or complex multi-strategy auth flows.

## Source

https://docs.nestjs.com/guards
