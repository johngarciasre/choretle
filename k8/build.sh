#!/usr/bin/env bash
# Build and push the Choretle Docker image.
set -euo pipefail

IMAGE="${1:-choretle}"
TAG="${2:-latest}"

echo "→ Building ${IMAGE}:${TAG} ..."
docker build \
  --tag "${IMAGE}:${TAG}" \
  --file Dockerfile \
  .

echo "→ Done: ${IMAGE}:${TAG}"
