# Changelog

All notable changes to BackupOS are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security
- Strip `resticPassword`, `config`, and `escrowedKey` from `repositories.list` API response — credentials are no longer sent to the browser
- Add HTTP security headers to all responses: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- Production startup now hard-exits on missing or placeholder `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ENCRYPTION_KEY`
- Enable better-auth rate limiting (10 requests / 60 s window) on all auth endpoints
- Enable `useSecureCookies` in production
- Validate `sourceConfig.paths` to reject directory traversal sequences (`..`)
- Emit audit log entries on repository and job create/delete mutations

### Changed
- `backup_runs` FK columns (`job_id`, `agent_id`, `repository_id`) now use `ON DELETE SET NULL` — deleting a parent row preserves run history
- Added indexes on `backup_runs.job_id` and `backup_runs.started_at` for faster run history queries
- Docker base image pinned to `node:22-alpine3.21`
- Docker releases now publish versioned image tags (`vX.Y.Z`, `vX.Y`, `latest`) to ghcr.io

### Fixed
- Custom migration runner handles multi-statement SQL files via `statement-breakpoint` splitting
- Migration idempotency: `already exists` and `duplicate column name` errors are caught per-statement
- Scheduler now initialises in `server.ts` after HTTP listen, avoiding Next.js instrumentation bundling failures
- `better-auth` origin validation now reads `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` from environment
- All workspace packages export a `require` condition so Next.js SSR can resolve them via CommonJS

## [0.1.0] - 2026-04-01

### Added
- Initial release: repository management, backup jobs, agents, restore specs, monitors, alerts, audit log, docs
