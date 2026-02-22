FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install Claude Code CLI globally via npm (puts binary in /usr/local/bin/claude)
RUN npm install -g @anthropic-ai/claude-code \
    && claude --version || true
ENV DISABLE_AUTOUPDATER=1

# Create persistent data directory for settings
RUN mkdir -p /app/data

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
