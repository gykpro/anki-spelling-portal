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

# Install Claude Code CLI globally
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && ln -s /root/.local/bin/claude /usr/local/bin/claude
ENV DISABLE_AUTOUPDATER=1

# Create persistent data directory for settings
RUN mkdir -p /app/data

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
