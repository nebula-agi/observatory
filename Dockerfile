FROM oven/bun:1@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS builder
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Install root dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

# Build the UI
COPY ui/package.json ui/bun.lock* ui/
RUN cd ui && bun install --frozen-lockfile --ignore-scripts
COPY ui/ ui/
COPY tsconfig.json ./
COPY src/ src/
RUN cd ui && bun run build

FROM oven/bun:1-slim@sha256:478281fdd196871c7e51ba6a820b7803a8ae97042ec86cdbc2e1c6b6626442d9
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --ignore-scripts

COPY --from=builder /app/src ./src
COPY --from=builder /app/ui/dist ./ui/dist
COPY supabase ./supabase

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
