---
schemaVersion: 1
module: "templates/django/src"
sourceHash: "4de321203cf01128fd98664ab05fbf7cf8e16488a34a357b2bfe830c1db5582e"
compiledAt: "2026-08-28T01:22:12.810Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["urls.py"]
---

## Summary

`templates/django/src` is a minimal Django project scaffold with three core components: a basic URL router exposing only the admin interface, a templated settings module with development-focused defaults (SQLite3, debug mode, insecure key), and a WSGI application entry point. The module uses Handlebars templating (`{{projectName}}`) to inject project names into settings and WSGI configuration at generation time. It includes Django's standard middleware stack (security, sessions, CSRF, auth, messages) and installs the built-in admin, auth, and static-files apps.

## Invariants

- Handlebars substitution is required: {{projectName}} placeholders in settings.py.hbs and wsgi.py.hbs must be replaced with the actual project name before Django can boot; the module is a template, not executable Python.
- Development-only defaults: DEBUG=True, ALLOWED_HOSTS=[], and a hardcoded insecure SECRET_KEY fallback make this unsuitable for production without explicit configuration overrides.
- WSGI module name coupling: WSGI_APPLICATION and DJANGO_SETTINGS_MODULE must match the generated module structure exactly ({{projectName}}.wsgi.application and {{projectName}}.settings).
- Empty URL routing: Only the admin panel is wired; no application views are defined—intended as a starting point, not a runnable app.
- SQLite3 hardcoded: DATABASES uses SQLite3 with a local db.sqlite3 file; database selection is not configurable at template generation time.

## Interface Contract

```ts

```

## Dependency Slice

```

```
