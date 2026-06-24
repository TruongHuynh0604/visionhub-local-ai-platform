#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export VISIONHUB_DATA_DIR="${VISIONHUB_DATA_DIR:-/tmp/visionhub_data}"
mkdir -p "$VISIONHUB_DATA_DIR"

exec uvicorn backend.app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
