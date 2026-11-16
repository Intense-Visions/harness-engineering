---
'@harness-engineering/cli': patch
---

Fresh framework scaffolds no longer report their own conventional entry files as dead code. Each template now declares the entry files it renders in `entropy.entryPoints` (`eslint.config.mjs`, `vite.config.ts` + `src/main.tsx` for React/Vue Vite, `next.config.mjs` + `app/` route files for Next.js, `src/main.ts` for NestJS, `src/app.ts` for Express, `manage.py` + settings/urls/wsgi for Django, `src/main.py` for FastAPI), the overlay merge unions those lists across template layers, and `init` drops any declared entry the write did not put on disk (e.g. into an existing project).
