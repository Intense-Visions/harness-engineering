# Auth Feature

**Keywords:** auth, authentication, login

## Overview

Authentication feature for the sample project.

## Success Criteria

1. When a user calls AuthService.login with valid credentials, the system shall return a session token
2. When a user calls AuthService.login with invalid credentials, the system shall throw an AuthError
3. The system shall hash passwords using the hashPassword function before storage
4. While the session is active, the system shall validate tokens on every request
5. If the token is expired, then the system shall not grant access

## Technical Design

Uses AuthService and hashPassword from the existing codebase.

## File Layout

```
src/auth-service.ts    MODIFY
src/utils/hash.ts      MODIFY
```
