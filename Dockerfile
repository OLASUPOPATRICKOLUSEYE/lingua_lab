# Shared Node/pnpm dependencies for development, production builds, and workers.
FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# pnpm via corepack (matches the repo's packageManager / lockfile).
RUN corepack enable

WORKDIR /app

# Install deps first for layer caching. Workspace manifests only.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json packages/db/
COPY packages/ts-config/package.json packages/ts-config/
RUN pnpm install --frozen-lockfile

# The production app embeds these public values at build time. They remain
# optional here so a plain `docker build --target runner .` is usable locally;
# production compose requires both variables.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

# `next build` imports every API route to collect page data, which pulls in
# packages/db/src/client.ts - that module constructs a live pg.Pool at import
# time and throws if DATABASE_URL is unset. No query ever runs during the
# build, so a syntactically-valid placeholder is enough (pg.Pool doesn't
# connect until a query is issued) - this never reaches the runner stage
# since `runner` starts fresh from node:22-bookworm-slim rather than FROM
# this stage, so the real runtime DATABASE_URL (set by the platform) is what
# the deployed app actually uses.
ARG DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV DATABASE_URL=${DATABASE_URL}

# App source is bind-mounted in compose for hot reload; copying here keeps the
# image runnable standalone too.
COPY . .

# Workers execute TypeScript directly, so they require the source tree and
# installed workspace dependencies rather than Next's standalone output.
FROM base AS worker

CMD ["pnpm", "worker:grading"]

# Local-dev image for the LinguaLab Next.js app.
FROM base AS dev

EXPOSE 3000
CMD ["pnpm", "dev"]

# `runner` is deliberately the LAST stage in this file: platforms that can't
# select a build target from a multi-stage Dockerfile (Railway, notably) just
# run a plain `docker build .` and get whichever stage is defined last. Do not
# reorder this below anything else. Compose/Coolify use explicit `target:` and
# are unaffected either way.
FROM base AS builder

RUN pnpm build

FROM node:22-bookworm-slim AS runner

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
