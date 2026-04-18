FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat curl

# Download restic binary so the image is self-contained
ARG RESTIC_VERSION=0.17.3
RUN curl -fsSL "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_amd64.bz2" \
    | bunzip2 -c > /usr/local/bin/restic \
    && chmod +x /usr/local/bin/restic

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json             packages/db/
COPY packages/engine/package.json         packages/engine/
COPY packages/app-hooks/package.json      packages/app-hooks/
COPY packages/hypervisors/package.json    packages/hypervisors/
COPY packages/monitors/package.json      packages/monitors/
COPY packages/restore/package.json        packages/restore/
COPY packages/agent-protocol/package.json packages/agent-protocol/
COPY packages/api/package.json            packages/api/
COPY packages/types/package.json          packages/types/
COPY apps/web/package.json                apps/web/
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json             packages/db/
COPY packages/engine/package.json         packages/engine/
COPY packages/app-hooks/package.json      packages/app-hooks/
COPY packages/hypervisors/package.json    packages/hypervisors/
COPY packages/monitors/package.json      packages/monitors/
COPY packages/restore/package.json        packages/restore/
COPY packages/agent-protocol/package.json packages/agent-protocol/
COPY packages/api/package.json            packages/api/
COPY packages/types/package.json          packages/types/
COPY apps/web/package.json                apps/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/

# Build all workspace packages then the web app
RUN pnpm --filter @backupos/db build \
    && pnpm --filter @backupos/engine build \
    && pnpm --filter @backupos/app-hooks build \
    && pnpm --filter @backupos/hypervisors build \
    && pnpm --filter @backupos/monitors build \
    && pnpm --filter @backupos/restore build \
    && pnpm --filter @backupos/agent-protocol build \
    && pnpm --filter @backupos/api build \
    && pnpm --filter @backupos/web exec next build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copy restic from base stage
COPY --from=base /usr/local/bin/restic /usr/local/bin/restic

# Copy built web app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy built packages (needed at runtime via node_modules symlinks)
COPY --from=builder /app/packages/db/dist           ./packages/db/dist
COPY --from=builder /app/packages/engine/dist        ./packages/engine/dist
COPY --from=builder /app/packages/app-hooks/dist     ./packages/app-hooks/dist
COPY --from=builder /app/packages/hypervisors/dist   ./packages/hypervisors/dist
COPY --from=builder /app/packages/monitors/dist      ./packages/monitors/dist
COPY --from=builder /app/packages/restore/dist       ./packages/restore/dist
COPY --from=builder /app/packages/agent-protocol/dist ./packages/agent-protocol/dist
COPY --from=builder /app/packages/api/dist           ./packages/api/dist
COPY --from=builder /app/node_modules                ./node_modules

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
