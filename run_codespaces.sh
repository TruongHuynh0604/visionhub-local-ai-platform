#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

python -m pip install --upgrade pip
pip install -r backend/requirements.txt

export VISIONHUB_DATA_DIR="${VISIONHUB_DATA_DIR:-$PWD/backend/data}"
mkdir -p "$VISIONHUB_DATA_DIR"

# Bind to 0.0.0.0 so GitHub Codespaces can forward the web server.
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
