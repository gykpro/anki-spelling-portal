FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install curl for Claude CLI installer
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (Claude CLI refuses bypassPermissions as root)
RUN groupadd -r portal && useradd -r -g portal -d /app portal

# Install Claude Code CLI as the non-root user
USER portal
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/app/.local/bin:${PATH}"
ENV DISABLE_AUTOUPDATER=1

# Switch back to root to copy files and set permissions
USER root

# Create persistent data directory for settings
RUN mkdir -p /app/data

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Ensure the portal user owns the app directory
RUN chown -R portal:portal /app

USER portal
EXPOSE 3000
CMD ["node", "server.js"]
