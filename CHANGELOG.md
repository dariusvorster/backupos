# Changelog

All notable changes to BackupOS are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-04-27

### Added
- Container agents auto-prefix `/host` onto absolute filesystem paths so users specify `/etc` and the agent transparently maps to `/host/etc`. Idempotent, opt-out via `BACKUPOS_HOST_PREFIX` env var (#36)
- Deprecation banner on `docker_volume` jobs recommending `compose_project` as the modern alternative (#49)
- Public multi-arch container images: `ghcr.io/dariusvorster/backupos-agent:v0.2.0` and `ghcr.io/dariusvorster/backupos-web:v0.2.0` (linux/amd64 + linux/arm64)

### Security
- Strip `resticPassword`, `config`, and `escrowedKey` from `repositories.list` API response — credentials are no longer sent to the browser
- Add HTTP security headers to all responses: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- Production startup now hard-exits on missing or placeholder `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ENCRYPTION_KEY`
- Enable better-auth rate limiting (10 requests / 60 s window) on all auth endpoints
- Enable `useSecureCookies` in production
- Validate `sourceConfig.paths` to reject directory traversal sequences (`..`)
- Emit audit log entries on repository and job create/delete mutations
- All 7 user-facing custom-server endpoints (force-update, detect, list-compose, test-repo, test-mount, test-mount-2, cancel-run) now require valid session — previously any local POST could trigger agent operations without authentication (#48)

### Changed
- `backup_runs` FK columns (`job_id`, `agent_id`, `repository_id`) now use `ON DELETE SET NULL` — deleting a parent row preserves run history
- Added indexes on `backup_runs.job_id` and `backup_runs.started_at` for faster run history queries
- Docker base image pinned to `node:22-alpine3.21`
- Docker releases now publish versioned image tags (`vX.Y.Z`, `vX.Y`, `latest`) to ghcr.io
- `retryRun` now uses agent dispatch with proper failure states instead of falling back to local restic execution. Failed retries are marked `failed` with clear error messages instead of leaving runs stuck in `running` (#23)

### Fixed
- Manual triggers via "Run now" now survive server restarts. `initScheduler` previously overwrote `next_run_at` unconditionally on startup, clobbering pending manual triggers (#26)
- `ResticEngine.restore()` now accepts an `AbortSignal` threaded through to `runStreaming`, so cancellation actually kills the restic subprocess (#33)
- `apps/docs` MDX prerender no longer fails — added Note, Tip, FeatureComparison, GlossaryTable, Warning components plus 11 stub components for content not yet written (#43)
- Custom migration runner handles multi-statement SQL files via `statement-breakpoint` splitting
- Migration idempotency: `already exists` and `duplicate column name` errors are caught per-statement
- Scheduler now initialises in `server.ts` after HTTP listen, avoiding Next.js instrumentation bundling failures
- `better-auth` origin validation now reads `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` from environment
- All workspace packages export a `require` condition so Next.js SSR can resolve them via CommonJS

### Removed
- `agent-release.yml` workflow (Windows agent binaries deferred indefinitely; no Windows host support in this release) (#45)
- 199 lines of orphaned local-execution code (`executeRun`, `runJobCore`, `resolveBackupPaths`) from scheduler.ts — replaced by the agent-dispatch-only model

### Known issues
- Snapshot paths from container-agent backups retain the `/host` prefix in metadata. Side-by-side restore handles this naturally; cross-agent in-place restore is awkward. To be addressed in v0.3.0.
- `docker-release.yml` workflow takes 26+ minutes due to QEMU emulation for arm64 builds — functional but slow.
- `/restore/compose/new` page is not linked from UI navigation. Direct URL access works.

## [0.1.0] - 2026-04-01

### Added
- Initial release: repository management, backup jobs, agents, restore specs, monitors, alerts, audit log, docs
