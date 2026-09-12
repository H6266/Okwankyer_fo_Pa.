#!/usr/bin/env bash
set -euo pipefail

export PORT="${PORT:-55120}"
exec gunicorn app:app --bind "0.0.0.0:${PORT}"
