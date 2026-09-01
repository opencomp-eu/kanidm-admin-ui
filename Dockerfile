# --- Build stage: frontend ---
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npm run build

# --- Build stage: backend ---
FROM rust:1-bookworm AS backend
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
# Create a dummy main.rs to cache dependencies
RUN mkdir src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release 2>/dev/null || true
RUN rm -rf src
# Copy real source and build
COPY src/ src/
RUN touch src/main.rs && cargo build --release

# --- Runtime stage ---
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend /app/target/release/kanidm-admin-ui /app/kanidm-admin-ui
COPY --from=frontend /app/static /app/static

ENV LISTEN_ADDR=0.0.0.0:8080
EXPOSE 8080

CMD ["/app/kanidm-admin-ui"]
