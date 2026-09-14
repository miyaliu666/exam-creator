FROM oven/bun:1.3.11 AS bun_runtime

# Prisma, Vite and Babel invoke Node; keep Bun for the checked-in lockfile.
FROM node:22-bookworm AS frontend_builder
WORKDIR /app
COPY --from=bun_runtime /usr/local/bin/bun /usr/local/bin/bun

# Copy dependency information first for better caching
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# Copy Prisma schema
COPY prisma/ prisma/
COPY prisma.config.ts .

# Generate Prisma client
RUN bun run prisma generate

# Copy the rest of the frontend files
COPY tsconfig.json vite.config.ts index.html ./
COPY client/ client/
COPY language-item-workbench/exercise-templates/ language-item-workbench/exercise-templates/
COPY public/ public/

# Build frontend
RUN bun run build

# Match the runtime's libc distribution so a successful build is also runnable.
FROM rust:1-bookworm AS builder
WORKDIR /app

COPY server/ server/
COPY prisma/ prisma/
COPY language-item-workbench/registries/ language-item-workbench/registries/
COPY language-item-workbench/contracts/ language-item-workbench/contracts/
COPY language-item-workbench/exercise-templates/catalog.json language-item-workbench/exercise-templates/catalog.json
COPY Cargo.toml Cargo.lock ./
# Copy frontend build to the 'dist' directory for the server to use
COPY --from=frontend_builder /app/dist /app/dist

# Build application
RUN cargo build --locked --release

FROM debian:bookworm-slim AS runtime
WORKDIR /
# Install runtime dependencies for Rust binary (OpenSSL for reqwest/oauth2/mongodb)
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates && \
    apt-get autoremove -y && \
    apt-get clean -y && \
    rm -rf /var/lib/apt/lists/*

# Metadata labels for container management and documentation
LABEL org.opencontainers.image.title="Exam Creator" \
      org.opencontainers.image.description="Rust Axum + React application for exam creation and management" \
      org.opencontainers.image.source="https://github.com/freeCodeCamp/exam-creator" \
      org.opencontainers.image.vendor="exam-creator" \
      org.opencontainers.image.licenses="BSD-3-Clause"

# Copy the compiled application from the builder stage
COPY --from=builder /app/target/release/server /server
# Copy static assets from the 'dist' directory
COPY --from=builder /app/dist /dist

# The app reads Railway's PORT at runtime; 8080 is the local default.
EXPOSE 8080
USER 10001:10001

# Set the entrypoint for the container
ENTRYPOINT ["/server"]
