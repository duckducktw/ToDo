# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 16 App Router application written in strict TypeScript. Routes and API handlers live in `src/app/`; reusable UI is in `src/components/`, client hooks in `src/hooks/`, domain and persistence logic in `src/lib/`, and shared declarations in `src/types/`. Static PWA assets belong in `public/`. Keep tests grouped by scope under `tests/unit/`, `tests/component/`, `tests/backend/`, and `tests/e2e/`; shared deterministic data lives in `tests/fixtures/`. Deployment helpers are in `scripts/`.

## Build, Test, and Development Commands

- `npm install`: install the locked dependencies; Node.js 22+ is required.
- `npm run dev`: start the local Next.js server on port 3000.
- `npm run lint`: run Next.js ESLint rules with zero warnings allowed.
- `npm run typecheck`: run strict TypeScript checking without emitting files.
- `npm test`: run all Vitest unit, component, and backend tests once.
- `npm run test:e2e`: run Playwright against an isolated server and test data store.
- `npm run build`: create the standalone production build.
- `npm run check`: run the complete lint, typecheck, test, build, and E2E gate.

## Coding Style & Naming Conventions

Follow the existing two-space indentation, double quotes, semicolons, and trailing commas. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and kebab-case filenames such as `task-card.tsx`. Prefer the `@/` alias for imports from `src`. Keep server-only storage and authentication code out of client components. ESLint is the formatting and correctness authority; no separate formatter is configured.

## Testing Guidelines

Vitest discovers `tests/**/*.test.{ts,tsx}` except E2E files; React component tests use Testing Library and jsdom where needed. Playwright specs use `tests/e2e/*.spec.ts` and cover desktop, tablet, mobile, and a Firefox hydration check. Add focused regression tests near the affected layer. No numeric coverage threshold is configured; preserve meaningful behavior coverage and run `npm run check` before merging.

## Commit & Pull Request Guidelines

History uses short imperative summaries such as `Fix pending logic and cursor` and `add notify sync`. Keep commits narrowly scoped and describe the behavior changed. Pull requests should include a concise problem/solution summary, verification commands, linked issues when applicable, and screenshots for visible UI changes. Call out environment, data-schema, authentication, or PWA changes explicitly.

## Security & Configuration

Copy `.env.example` to `.env`, but never commit secrets, OAuth credentials, or populated `src/data/`. Keep Google Calendar read-only and never enable `AUTH_TEST_MODE` on a network-accessible instance. The JSON store supports one long-lived Node.js process, not multiple replicas.
