FROM node:20-alpine

# restic  — required for backup/restore
# tini    — proper PID 1 / signal handling (ensures Docker stop/restart works correctly)
# curl    — used by the agent's bundle self-update download
RUN apk add --no-cache restic tini curl ca-certificates

# The agent runs as root inside the container so it can read mounted Docker volumes
# (which are root-owned) and so docker-cli operations against /var/run/docker.sock work.
# The container itself is the security boundary, not the process user.
WORKDIR /app

# bundle.js is copied into the build context by the build:container script
# (cp ../web/public/agent/bundle.js ./bundle.js before docker build)
COPY bundle.js /app/agent.js

# Restic cache — persist across restarts via a named volume mounted at this path
ENV XDG_CACHE_HOME=/var/cache/restic
ENV HOME=/root
RUN mkdir -p /var/cache/restic

# Agent state (enrollment token, bundle hash) — persist via named volume at this path
RUN mkdir -p /var/lib/backupos

# tini as PID 1 handles SIGTERM/SIGCHLD correctly and reaps zombie processes.
# When the agent self-updates (controlled exit + re-spawn via process.argv), tini
# sees the child exit and Docker's restart: unless-stopped policy brings the container
# back up with the updated bundle.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/node", "/app/agent.js", "run"]
