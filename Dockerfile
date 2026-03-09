FROM oven/bun:1 AS builder
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

FROM oven/bun:1-slim
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --ignore-scripts

COPY --from=builder /app/src ./src
COPY --from=builder /app/ui/dist ./ui/dist
COPY supabase ./supabase

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
