FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat curl bzip2

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Download restic — supports amd64 and arm64 host builds
ARG RESTIC_VERSION=0.17.3
ARG TARGETARCH
RUN ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "amd64") \
    && curl -fsSL "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_${ARCH}.bz2" \
    | bunzip2 -c > /usr/local/bin/restic \
    && chmod +x /usr/local/bin/restic

# ── Builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy manifests first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json                packages/db/
COPY packages/engine/package.json            packages/engine/
COPY packages/app-hooks/package.json         packages/app-hooks/
COPY packages/hypervisors/package.json       packages/hypervisors/
COPY packages/monitors/package.json          packages/monitors/
COPY packages/restore/package.json           packages/restore/
COPY packages/agent-protocol/package.json    packages/agent-protocol/
COPY packages/api/package.json               packages/api/
COPY packages/types/package.json             packages/types/
COPY packages/docs-content/package.json      packages/docs-content/
COPY apps/web/package.json                   apps/web/

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/

# Build workspace packages then the web app
RUN pnpm --filter @backupos/db build \
    && pnpm --filter @backupos/engine build \
    && pnpm --filter @backupos/app-hooks build \
    && pnpm --filter @backupos/hypervisors build \
    && pnpm --filter @backupos/monitors build \
    && pnpm --filter @backupos/restore build \
    && pnpm --filter @backupos/agent-protocol build \
    && pnpm --filter @backupos/api build \
    && pnpm --filter @backupos/docs-content build \
    && pnpm --filter @backupos/web exec next build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=base /usr/local/bin/restic /usr/local/bin/restic

# Workspace root
COPY --from=builder /app/node_modules        ./node_modules
COPY --from=builder /app/package.json        ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Web app
COPY --from=builder /app/apps/web/.next      ./apps/web/.next
COPY --from=builder /app/apps/web/public     ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/server.ts  ./apps/web/server.ts
COPY --from=builder /app/apps/web/lib        ./apps/web/lib
COPY --from=builder /app/apps/web/tsconfig.json ./apps/web/tsconfig.json

# Packages
COPY --from=builder /app/packages/db/dist               ./packages/db/dist
COPY --from=builder /app/packages/db/package.json        ./packages/db/package.json
COPY --from=builder /app/packages/engine/dist            ./packages/engine/dist
COPY --from=builder /app/packages/engine/package.json    ./packages/engine/package.json
COPY --from=builder /app/packages/app-hooks/dist         ./packages/app-hooks/dist
COPY --from=builder /app/packages/app-hooks/package.json ./packages/app-hooks/package.json
COPY --from=builder /app/packages/hypervisors/dist       ./packages/hypervisors/dist
COPY --from=builder /app/packages/hypervisors/package.json ./packages/hypervisors/package.json
COPY --from=builder /app/packages/monitors/dist          ./packages/monitors/dist
COPY --from=builder /app/packages/monitors/package.json  ./packages/monitors/package.json
COPY --from=builder /app/packages/restore/dist           ./packages/restore/dist
COPY --from=builder /app/packages/restore/package.json   ./packages/restore/package.json
COPY --from=builder /app/packages/agent-protocol/dist    ./packages/agent-protocol/dist
COPY --from=builder /app/packages/agent-protocol/package.json ./packages/agent-protocol/package.json
COPY --from=builder /app/packages/api/dist               ./packages/api/dist
COPY --from=builder /app/packages/api/package.json       ./packages/api/package.json
COPY --from=builder /app/packages/docs-content/dist      ./packages/docs-content/dist
COPY --from=builder /app/packages/docs-content/package.json ./packages/docs-content/package.json

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data /app/apps/web

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV RESTIC_BINARY_PATH=/usr/local/bin/restic

CMD ["node_modules/.bin/tsx", "apps/web/server.ts"]
