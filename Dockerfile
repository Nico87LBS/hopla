# Stage 1: Build the web app. It runs on the build host only: the output is
# plain static files, the same for every target platform.
FROM --platform=$BUILDPLATFORM node:22-alpine AS web

WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
RUN npx vite build --mode selfhosted

# Stage 2: Build the server, with the web app embedded.
# --platform=$BUILDPLATFORM pins this stage to the host (native) architecture
# even when building for other target platforms, so `go build` cross-compiles
# natively via GOOS/GOARCH instead of running under QEMU emulation. Emulated
# `go build` for arm64/armv7 is drastically slower than native cross-compiling
# a pure-Go (CGO_ENABLED=0) binary -- this matters for the multi-arch
# (linux/amd64,arm64) image built in image.yml.
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS builder

WORKDIR /usr/src/app

RUN apk --no-cache add ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
COPY --from=web /web/dist ./frontend/dist

# TARGETOS/TARGETARCH are populated automatically by buildkit for the actual
# target platform being built, regardless of the native host running this stage.
ARG TARGETOS
ARG TARGETARCH
# VERSION/COMMIT are baked into config.Version/config.Commit via ldflags so
# `/api/v1/resource` and `/health` report the exact build that's running.
# Passing neither is fine for local/dev builds (falls back to "dev").
ARG VERSION=dev
ARG COMMIT=dev
RUN BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) && \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -ldflags="-s -w \
      -X github.com/nico87lbs/hopla/config.Version=${VERSION} \
      -X github.com/nico87lbs/hopla/config.Commit=${COMMIT} \
      -X github.com/nico87lbs/hopla/config.BuildDate=${BUILD_DATE}" \
      -buildvcs=false -o /hopla .

# Stage 3: Create a smaller runtime image
FROM alpine:latest

# Install necessary CA certificates and timezone data
RUN apk --no-cache add ca-certificates libc6-compat tzdata

# Copy the binary and config folder from the builder stage
COPY --from=builder /hopla /hopla
COPY --from=builder /usr/src/app/config /config

# Set environment variables; override at `docker run`/compose time to pick
# the config file under /config (e.g. HOPLA_ENV=selfhosted or HOPLA_ENV=prod)
ENV HOPLA_ENV="selfhosted"

# Expose the application port
EXPOSE 2021

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:2021/api/v1/health || exit 1

# Command to run the application
CMD ["/hopla"]
