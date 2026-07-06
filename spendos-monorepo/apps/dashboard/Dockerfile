# Stage 1: Build environment
FROM node:20-alpine AS builder
WORKDIR /app

# Copy lockfile and package configs for caching
COPY package.json package-lock.json ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/shared-types/package.json ./packages/shared-types/

# Install dependencies cleanly
RUN npm ci

# Copy codebase
COPY . .

# Build Next.js app with standalone tracing active
ENV STANDALONE=true
RUN npm run build --workspace=apps/dashboard

# Stage 2: Lean execution environment
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002
ENV HOSTNAME="0.0.0.0"

# Copy standalone output, static assets and public assets
COPY --chown=node:node --from=builder /app/apps/dashboard/public ./apps/dashboard/public
COPY --chown=node:node --from=builder /app/apps/dashboard/.next/standalone ./
COPY --chown=node:node --from=builder /app/apps/dashboard/.next/static ./apps/dashboard/.next/static

USER node
EXPOSE 3002
CMD ["node", "apps/dashboard/server.js"]
