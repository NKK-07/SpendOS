# Stage 1: Build environment
FROM node:20-alpine AS builder
WORKDIR /app

# Copy lockfile and package configs for caching
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/database/package.json ./packages/database/
COPY packages/ledger/package.json ./packages/ledger/
COPY packages/shared-types/package.json ./packages/shared-types/

# Install dependencies cleanly
RUN npm ci

# Copy codebase
COPY . .

# Generate Prisma Client
RUN npm run db:generate --workspace=packages/database

# Build all typescript packages
RUN npm run build

# Prune dev dependencies for lean runner
RUN npm prune --omit=dev

# Stage 2: Lean execution environment
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy necessary runtime artifacts from builder
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps/api ./apps/api
COPY --chown=node:node --from=builder /app/packages ./packages

USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/api"]
